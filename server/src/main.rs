use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
    routing::get,
    Json, Router,
};
use draw_party_server::{
    engine::{generate_room_code, EngineError, EngineEvent, Room},
    protocol::{ClientMessage, GamePhase, Role, RoomSnapshot, ServerMessage},
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashMap},
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{
    net::TcpListener,
    sync::{mpsc, Mutex},
    time::{self, Duration},
};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<AppInner>>,
}

#[derive(Default)]
struct AppInner {
    rooms: HashMap<String, Room>,
    connections: HashMap<String, Connection>,
}

struct Connection {
    role: Role,
    room_code: Option<String>,
    tx: mpsc::UnboundedSender<ServerMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WsQuery {
    room: Option<String>,
    role: Role,
    #[serde(alias = "client_id")]
    client_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "draw_party_server=info,tower_http=info".into()),
        )
        .init();

    let bind_addr: SocketAddr = std::env::var("DRAW_PARTY_BIND")
        .unwrap_or_else(|_| "127.0.0.1:3000".to_string())
        .parse()
        .expect("DRAW_PARTY_BIND must be a socket address");
    let static_dir = std::env::var("DRAW_PARTY_STATIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("client/dist"));

    let state = AppState {
        inner: Arc::new(Mutex::new(AppInner::default())),
    };
    spawn_room_maintenance(state.clone());

    let static_service =
        ServeDir::new(&static_dir).fallback(ServeFile::new(static_dir.join("index.html")));

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/ws", get(ws_handler))
        .fallback_service(static_service)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(bind_addr)
        .await
        .expect("failed to bind server socket");
    info!("draw-party-server listening on http://{bind_addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server failed");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "draw-party-server",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, query))
}

async fn handle_socket(socket: WebSocket, state: AppState, query: WsQuery) {
    let client_id = query
        .client_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    {
        let mut inner = state.inner.lock().await;
        inner.connections.insert(
            client_id.clone(),
            Connection {
                role: query.role.clone(),
                room_code: query.room.as_ref().map(|room| room.to_uppercase()),
                tx,
            },
        );

        if let Some(room_code) = &query.room {
            let room_code = room_code.to_uppercase();
            let snapshot = if let Some(room) = inner.rooms.get_mut(&room_code) {
                if query.role == Role::Display {
                    room.add_display(client_id.clone(), now_ms());
                }
                Some(room.snapshot())
            } else {
                queue_error_for_connection(
                    &inner,
                    &client_id,
                    EngineError {
                        code: "room_not_found",
                        message: "That room does not exist.".to_string(),
                    },
                );
                None
            };
            if let Some(snapshot) = snapshot {
                if let Some(room) = inner.rooms.get(&room_code) {
                    let snapshot = personalize_snapshot(room, &snapshot, &client_id, &query.role);
                    queue_snapshot_for_connection(&inner, &client_id, snapshot);
                }
                if query.role == Role::Player {
                    if let Some(room) = inner.rooms.get(&room_code) {
                        if room.phase == GamePhase::Drawing {
                            if let Some(prompt) = room.prompt_for_player(&client_id) {
                                if let Some(conn) = inner.connections.get(&client_id) {
                                    let _ = conn.tx.send(ServerMessage::PromptAssigned { prompt });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let sender_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match serde_json::to_string(&message) {
                Ok(text) => {
                    if ws_sender.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    error!(?err, "failed to serialize server message");
                    break;
                }
            }
        }
    });

    while let Some(message) = ws_receiver.next().await {
        match message {
            Ok(Message::Text(text)) => match serde_json::from_str::<ClientMessage>(&text) {
                Ok(client_message) => {
                    handle_client_message(&state, &client_id, client_message).await;
                }
                Err(err) => {
                    warn!(?err, "invalid client message");
                    send_error(
                        &state,
                        &client_id,
                        "invalid_message",
                        "Message format was not understood.",
                    )
                    .await;
                }
            },
            Ok(Message::Close(_)) => break,
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) | Ok(Message::Binary(_)) => {}
            Err(err) => {
                warn!(?err, "websocket receive error");
                break;
            }
        }
    }

    sender_task.abort();
    disconnect_client(&state, &client_id).await;
}

async fn handle_client_message(state: &AppState, client_id: &str, message: ClientMessage) {
    match message {
        ClientMessage::CreateRoom => create_room(state, client_id).await,
        ClientMessage::JoinRoom { room_code, name } => {
            join_room(state, client_id, room_code, name).await
        }
        ClientMessage::SetName { name } => set_name(state, client_id, name).await,
        ClientMessage::StartGame => start_or_advance(state, client_id).await,
        ClientMessage::SubmitDrawing {
            turn_token,
            drawing,
        } => submit_drawing(state, client_id, turn_token, drawing).await,
        ClientMessage::SubmitGuess { turn_token, guess } => {
            submit_guess(state, client_id, turn_token, guess).await
        }
        ClientMessage::SubmitVote {
            turn_token,
            option_id,
        } => submit_vote(state, client_id, turn_token, option_id).await,
        ClientMessage::Heartbeat => {
            send_to_client(state, client_id, ServerMessage::Pong { now_ms: now_ms() }).await
        }
        ClientMessage::LeaveRoom => disconnect_client(state, client_id).await,
    }
}

async fn create_room(state: &AppState, client_id: &str) {
    let messages = {
        let mut inner = state.inner.lock().await;
        if !matches!(
            inner.connections.get(client_id).map(|conn| &conn.role),
            Some(Role::Display)
        ) {
            targeted_error(
                &inner,
                client_id,
                "display_only",
                "Only the TV display can create rooms.",
            )
        } else {
            let existing: BTreeSet<String> = inner.rooms.keys().cloned().collect();
            let room_code = generate_room_code(&existing);
            let room = Room::new(room_code.clone(), client_id.to_string(), now_ms());
            inner.rooms.insert(room_code.clone(), room);
            if let Some(conn) = inner.connections.get_mut(client_id) {
                conn.room_code = Some(room_code.clone());
            }
            room_messages(&inner, &room_code, EngineEvent::PhaseChanged)
        }
    };
    send_many(messages);
}

async fn join_room(state: &AppState, client_id: &str, room_code: String, name: String) {
    let room_code = room_code.to_uppercase();
    mutate_room(state, client_id, &room_code, |room| {
        room.upsert_player(client_id.to_string(), name, now_ms())?;
        Ok(EngineEvent::PlayerListChanged)
    })
    .await;
}

async fn set_name(state: &AppState, client_id: &str, name: String) {
    mutate_current_room(state, client_id, |room| {
        room.set_name(client_id, name, now_ms())?;
        Ok(EngineEvent::PlayerListChanged)
    })
    .await;
}

async fn start_or_advance(state: &AppState, client_id: &str) {
    let is_display = {
        let inner = state.inner.lock().await;
        matches!(
            inner.connections.get(client_id).map(|conn| &conn.role),
            Some(Role::Display)
        )
    };
    if !is_display {
        send_error(
            state,
            client_id,
            "display_only",
            "Only the TV display can advance the game.",
        )
        .await;
        return;
    }
    mutate_current_room(state, client_id, |room| {
        room.handle_start_or_advance(now_ms())
    })
    .await;
}

async fn submit_drawing(
    state: &AppState,
    client_id: &str,
    turn_token: u64,
    drawing: draw_party_server::protocol::DrawingDoc,
) {
    mutate_current_room(state, client_id, |room| {
        room.submit_drawing(client_id, turn_token, drawing, now_ms())
    })
    .await;
}

async fn submit_guess(state: &AppState, client_id: &str, turn_token: u64, guess: String) {
    mutate_current_room(state, client_id, |room| {
        room.submit_guess(client_id, turn_token, guess, now_ms())
    })
    .await;
}

async fn submit_vote(state: &AppState, client_id: &str, turn_token: u64, option_id: String) {
    mutate_current_room(state, client_id, |room| {
        room.submit_vote(client_id, turn_token, option_id, now_ms())
    })
    .await;
}

async fn mutate_current_room<F>(state: &AppState, client_id: &str, operation: F)
where
    F: FnOnce(&mut Room) -> Result<EngineEvent, EngineError>,
{
    let room_code = {
        let inner = state.inner.lock().await;
        inner
            .connections
            .get(client_id)
            .and_then(|conn| conn.room_code.clone())
    };

    if let Some(room_code) = room_code {
        mutate_room(state, client_id, &room_code, operation).await;
    } else {
        send_error(state, client_id, "not_in_room", "Join a room first.").await;
    }
}

async fn mutate_room<F>(state: &AppState, client_id: &str, room_code: &str, operation: F)
where
    F: FnOnce(&mut Room) -> Result<EngineEvent, EngineError>,
{
    let messages = {
        let mut inner = state.inner.lock().await;
        if let Some(conn) = inner.connections.get_mut(client_id) {
            conn.room_code = Some(room_code.to_string());
        }

        let result = inner
            .rooms
            .get_mut(room_code)
            .map(operation)
            .unwrap_or_else(|| {
                Err(EngineError {
                    code: "room_not_found",
                    message: "That room does not exist.".to_string(),
                })
            });

        match result {
            Ok(event) => room_messages(&inner, room_code, event),
            Err(error) => targeted_error(&inner, client_id, error.code, &error.message),
        }
    };
    send_many(messages);
}

async fn disconnect_client(state: &AppState, client_id: &str) {
    let messages = {
        let mut inner = state.inner.lock().await;
        let room_code = inner
            .connections
            .remove(client_id)
            .and_then(|conn| conn.room_code);
        if let Some(room_code) = room_code {
            let mut changed = false;
            if let Some(room) = inner.rooms.get_mut(&room_code) {
                room.mark_disconnected(client_id, now_ms());
                changed = true;
            }
            if changed {
                room_messages(&inner, &room_code, EngineEvent::PlayerListChanged)
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    };
    send_many(messages);
}

fn spawn_room_maintenance(state: AppState) {
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            let messages = {
                let mut inner = state.inner.lock().await;
                let now = now_ms();
                let mut changed_rooms = Vec::new();
                let room_codes: Vec<String> = inner.rooms.keys().cloned().collect();

                for room_code in &room_codes {
                    if let Some(room) = inner.rooms.get_mut(room_code) {
                        match room.advance_if_expired(now) {
                            Ok(Some(event)) => changed_rooms.push((room_code.clone(), event)),
                            Ok(None) => {}
                            Err(err) => warn!(
                                room_code,
                                code = err.code,
                                message = err.message,
                                "timer advance failed"
                            ),
                        }
                    }
                }

                let expired: Vec<String> = inner
                    .rooms
                    .iter()
                    .filter(|(_, room)| room.is_expired(now))
                    .map(|(code, _)| code.clone())
                    .collect();
                for room_code in expired {
                    inner.rooms.remove(&room_code);
                }

                changed_rooms
                    .into_iter()
                    .flat_map(|(room_code, event)| room_messages(&inner, &room_code, event))
                    .collect::<Vec<_>>()
            };
            send_many(messages);
        }
    });
}

fn room_messages(
    inner: &AppInner,
    room_code: &str,
    event: EngineEvent,
) -> Vec<(mpsc::UnboundedSender<ServerMessage>, ServerMessage)> {
    let Some(room) = inner.rooms.get(room_code) else {
        return Vec::new();
    };
    let base_snapshot = room.snapshot();

    let mut messages = Vec::new();
    for (client_id, conn) in &inner.connections {
        if conn.room_code.as_deref() != Some(room_code) {
            continue;
        }
        let snapshot = personalize_snapshot(room, &base_snapshot, client_id, &conn.role);
        let event_message = match event {
            EngineEvent::PhaseChanged => ServerMessage::PhaseChanged {
                snapshot: snapshot.clone(),
            },
            EngineEvent::FinalScores => ServerMessage::FinalScores {
                scores: snapshot.final_scores.clone(),
            },
            EngineEvent::PlayerListChanged => ServerMessage::PlayerListChanged {
                players: snapshot.players.clone(),
            },
            EngineEvent::Snapshot => ServerMessage::RoomSnapshot {
                snapshot: snapshot.clone(),
            },
        };
        messages.push((conn.tx.clone(), event_message));
        messages.push((
            conn.tx.clone(),
            ServerMessage::RoomSnapshot {
                snapshot: snapshot.clone(),
            },
        ));

        if snapshot.phase == GamePhase::Drawing && conn.role == Role::Player {
            if let Some(prompt) = room.prompt_for_player(client_id) {
                messages.push((conn.tx.clone(), ServerMessage::PromptAssigned { prompt }));
            }
        }

        if matches!(snapshot.phase, GamePhase::Guessing | GamePhase::Voting) {
            if let (Some(artist_id), Some(artist_name), Some(drawing)) = (
                snapshot.current_artist_id.clone(),
                snapshot.current_artist_name.clone(),
                snapshot.current_drawing.clone(),
            ) {
                messages.push((
                    conn.tx.clone(),
                    ServerMessage::DrawingReveal {
                        artist_id,
                        artist_name,
                        drawing,
                    },
                ));
            }
        }

        if snapshot.phase == GamePhase::Voting {
            messages.push((
                conn.tx.clone(),
                ServerMessage::VotingOptions {
                    options: snapshot.voting_options.clone(),
                },
            ));
        }

        if snapshot.phase == GamePhase::Results {
            if let Some(result) = snapshot.round_result.clone() {
                messages.push((conn.tx.clone(), ServerMessage::RoundResult { result }));
            }
        }
    }
    messages
}

fn personalize_snapshot(
    room: &Room,
    snapshot: &RoomSnapshot,
    client_id: &str,
    role: &Role,
) -> RoomSnapshot {
    let mut snapshot = snapshot.clone();
    if snapshot.phase != GamePhase::Voting || *role != Role::Player {
        return snapshot;
    }

    for option in &mut snapshot.voting_options {
        if let Some(source) = room
            .round
            .voting_options
            .iter()
            .find(|candidate| candidate.id == option.id)
        {
            if source.author_player_id.as_deref() == Some(client_id) {
                option.author_player_id = source.author_player_id.clone();
                option.author_name = source.author_name.clone();
            }
        }
    }
    snapshot
}

fn queue_snapshot_for_connection(inner: &AppInner, client_id: &str, snapshot: RoomSnapshot) {
    if let Some(conn) = inner.connections.get(client_id) {
        let _ = conn.tx.send(ServerMessage::RoomSnapshot { snapshot });
    }
}

fn queue_error_for_connection(inner: &AppInner, client_id: &str, err: EngineError) {
    if let Some(conn) = inner.connections.get(client_id) {
        let _ = conn.tx.send(ServerMessage::Error {
            code: err.code.to_string(),
            message: err.message,
        });
    }
}

async fn send_error(state: &AppState, client_id: &str, code: &str, message: &str) {
    send_to_client(
        state,
        client_id,
        ServerMessage::Error {
            code: code.to_string(),
            message: message.to_string(),
        },
    )
    .await;
}

async fn send_to_client(state: &AppState, client_id: &str, message: ServerMessage) {
    let tx = {
        let inner = state.inner.lock().await;
        inner.connections.get(client_id).map(|conn| conn.tx.clone())
    };
    if let Some(tx) = tx {
        let _ = tx.send(message);
    }
}

fn targeted_error(
    inner: &AppInner,
    client_id: &str,
    code: &str,
    message: &str,
) -> Vec<(mpsc::UnboundedSender<ServerMessage>, ServerMessage)> {
    inner
        .connections
        .get(client_id)
        .map(|conn| {
            vec![(
                conn.tx.clone(),
                ServerMessage::Error {
                    code: code.to_string(),
                    message: message.to_string(),
                },
            )]
        })
        .unwrap_or_default()
}

fn send_many(messages: Vec<(mpsc::UnboundedSender<ServerMessage>, ServerMessage)>) {
    for (tx, message) in messages {
        let _ = tx.send(message);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
