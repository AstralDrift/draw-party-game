use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, Request, State,
    },
    http::{
        header::{HeaderValue, CACHE_CONTROL},
        Uri,
    },
    middleware::{self, Next},
    response::Response,
    routing::get,
    Json, Router,
};
mod session;

use draw_party_server::{
    engine::{generate_room_code, EngineError, EngineEvent, Room},
    protocol::{ClientMessage, GamePhase, Role, RoomSettings, RoomSnapshot, ServerMessage},
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
    sync::Mutex,
    time::{self, Duration},
};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::{error, info, warn};
use uuid::Uuid;

use session::{deliver_many, Connection, OutboundMessage, SessionKey};

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<AppInner>>,
}

#[derive(Default)]
struct AppInner {
    rooms: HashMap<String, Room>,
    connections: HashMap<String, Connection>,
}

impl AppInner {
    fn connection(&self, session: &SessionKey) -> Option<&Connection> {
        self.connections
            .get(session.client_id())
            .filter(|connection| connection.matches(session))
    }

    fn connection_mut(&mut self, session: &SessionKey) -> Option<&mut Connection> {
        self.connections
            .get_mut(session.client_id())
            .filter(|connection| connection.matches(session))
    }

    fn replace_connection(&mut self, connection: Connection) -> Option<Connection> {
        self.connections
            .insert(connection.key().client_id().to_string(), connection)
    }

    fn remove_connection(&mut self, session: &SessionKey) -> Option<Connection> {
        if self.connection(session).is_some() {
            self.connections.remove(session.client_id())
        } else {
            None
        }
    }

    fn disconnect_room_member(&mut self, room_code: &str, client_id: &str) -> Vec<OutboundMessage> {
        let event = if let Some(room) = self.rooms.get_mut(room_code) {
            let now = now_ms();
            room.mark_disconnected(client_id, now);
            match room.advance_if_ready(now) {
                Ok(Some(event)) => Some(event),
                Ok(None) => Some(EngineEvent::PlayerListChanged),
                Err(err) => {
                    warn!(
                        room_code,
                        client_id,
                        code = err.code,
                        message = err.message,
                        "disconnect readiness advance failed"
                    );
                    Some(EngineEvent::PlayerListChanged)
                }
            }
        } else {
            None
        };

        event
            .map(|event| room_messages(self, room_code, event))
            .unwrap_or_default()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WsQuery {
    room: Option<String>,
    role: Role,
    #[serde(alias = "client_id")]
    client_id: Option<String>,
    session_token: Option<String>,
    host_token: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    git_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deployment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    environment_name: Option<String>,
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
        .layer(middleware::from_fn(cache_headers))
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
    Json(build_health_response(env_value))
}

fn build_health_response(get_env: impl Fn(&str) -> Option<String>) -> HealthResponse {
    HealthResponse {
        ok: true,
        service: "draw-party-server",
        version: env!("CARGO_PKG_VERSION"),
        git_sha: first_env(&get_env, &["RAILWAY_GIT_COMMIT_SHA", "GIT_SHA"]),
        git_branch: first_env(&get_env, &["RAILWAY_GIT_BRANCH", "GIT_BRANCH"]),
        deployment_id: first_env(&get_env, &["RAILWAY_DEPLOYMENT_ID", "DEPLOYMENT_ID"]),
        environment_name: first_env(&get_env, &["RAILWAY_ENVIRONMENT_NAME", "ENVIRONMENT_NAME"]),
    }
}

fn first_env(get_env: &impl Fn(&str) -> Option<String>, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| get_env(name).and_then(clean_env_value))
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok().and_then(clean_env_value)
}

fn clean_env_value(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

async fn cache_headers(request: Request, next: Next) -> Response {
    let uri = request.uri().clone();
    let mut response = next.run(request).await;
    if let Some(value) = cache_control_for(&uri) {
        response.headers_mut().insert(CACHE_CONTROL, value);
    }
    response
}

fn cache_control_for(uri: &Uri) -> Option<HeaderValue> {
    let path = uri.path();
    if path.starts_with("/api/") || path.starts_with("/ws") {
        return Some(HeaderValue::from_static("no-store"));
    }
    if path == "/" || path == "/index.html" || path == "/sw.js" || path.starts_with("/join/") {
        return Some(HeaderValue::from_static("no-cache"));
    }
    if path.starts_with("/assets/") {
        return Some(HeaderValue::from_static(
            "public, max-age=31536000, immutable",
        ));
    }
    None
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
    let session_token = query
        .session_token
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let requested_room = query
        .room
        .as_ref()
        .map(|room_code| room_code.to_uppercase());
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (connection, mut rx, mut close_rx) =
        Connection::new(client_id.clone(), query.role.clone(), session_token.clone());
    let session = connection.key().clone();
    let mut receiver_close_rx = close_rx.clone();

    let rejection = {
        let mut inner = state.inner.lock().await;
        if inner
            .connections
            .get(&client_id)
            .is_some_and(|existing| !existing.accepts_session_token(&session_token))
        {
            Some((
                "session_in_use",
                "This player session is already active on another device.",
            ))
        } else if query.role == Role::Player
            && inner
                .rooms
                .values()
                .any(|room| !room.player_session_matches(&client_id, &session_token))
        {
            Some((
                "invalid_player_session",
                "This player identity belongs to another device.",
            ))
        } else {
            let mut transition_messages = Vec::new();
            if let Some(replaced) = inner.replace_connection(connection) {
                if replaced.room_code() != requested_room.as_deref() {
                    if let Some(old_room_code) = replaced.room_code() {
                        transition_messages.extend(
                            inner.disconnect_room_member(old_room_code, session.client_id()),
                        );
                    }
                }
                replaced.retire();
            }

            if let Some(room_code) = requested_room.as_deref() {
                if query.role == Role::Display {
                    let now = now_ms();
                    let snapshot = match inner.rooms.get_mut(room_code) {
                        Some(room)
                            if query.host_token.as_deref() == Some(room.host_token.as_str()) =>
                        {
                            room.add_display(client_id.clone(), now);
                            Ok(room.snapshot(now))
                        }
                        Some(_) => Err(EngineError {
                            code: "unauthorized_display",
                            message: "This display is not authorized for that room.".to_string(),
                        }),
                        None => Err(EngineError {
                            code: "room_not_found",
                            message: "That room does not exist.".to_string(),
                        }),
                    };
                    match snapshot {
                        Ok(snapshot) => {
                            if let Some(conn) = inner.connection_mut(&session) {
                                conn.set_room_code(room_code.to_string());
                            }
                            queue_snapshot_for_connection(&inner, &session, snapshot);
                        }
                        Err(err) => queue_error_for_connection(&inner, &session, err),
                    }
                }
            }
            deliver_many(transition_messages);
            None
        }
    };

    if let Some((code, message)) = rejection {
        let error = ServerMessage::Error {
            code: code.to_string(),
            message: message.to_string(),
        };
        if let Ok(text) = serde_json::to_string(&error) {
            let _ = ws_sender.send(Message::Text(text.into())).await;
        }
        let _ = ws_sender.send(Message::Close(None)).await;
        return;
    }

    let sender_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                changed = close_rx.changed() => {
                    if changed.is_err() || *close_rx.borrow() {
                        let _ = ws_sender.send(Message::Close(None)).await;
                        break;
                    }
                }
                message = rx.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    match serde_json::to_string(&message) {
                        Ok(text) => {
                            tokio::select! {
                                changed = close_rx.changed() => {
                                    if changed.is_err() || *close_rx.borrow() {
                                        let _ = ws_sender.send(Message::Close(None)).await;
                                        break;
                                    }
                                }
                                result = ws_sender.send(Message::Text(text.into())) => {
                                    if result.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                        Err(err) => {
                            error!(?err, "failed to serialize server message");
                            break;
                        }
                    }
                }
            }
        }
    });

    loop {
        tokio::select! {
            changed = receiver_close_rx.changed() => {
                if changed.is_err() || *receiver_close_rx.borrow() {
                    break;
                }
            }
            message = ws_receiver.next() => {
                let Some(message) = message else {
                    break;
                };
                match message {
                    Ok(Message::Text(text)) => match serde_json::from_str::<ClientMessage>(text.as_str()) {
                        Ok(client_message) => {
                            handle_client_message(&state, &session, client_message).await;
                        }
                        Err(err) => {
                            warn!(?err, "invalid client message");
                            send_error(
                                &state,
                                &session,
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
        }
    }

    sender_task.abort();
    disconnect_client(&state, &session).await;
}

async fn handle_client_message(state: &AppState, session: &SessionKey, message: ClientMessage) {
    match message {
        ClientMessage::CreateRoom => create_room(state, session).await,
        ClientMessage::JoinRoom { room_code, name } => {
            join_room(state, session, room_code, name).await
        }
        ClientMessage::SetName { name } => set_name(state, session, name).await,
        ClientMessage::UpdateRoomSettings { settings } => {
            update_room_settings(state, session, settings).await
        }
        ClientMessage::StartGame => start_or_advance(state, session).await,
        ClientMessage::SubmitDrawing {
            turn_token,
            drawing,
        } => submit_drawing(state, session, turn_token, drawing).await,
        ClientMessage::SubmitGuess { turn_token, guess } => {
            submit_guess(state, session, turn_token, guess).await
        }
        ClientMessage::SubmitVote {
            turn_token,
            option_id,
        } => submit_vote(state, session, turn_token, option_id).await,
        ClientMessage::SendReaction { emoji } => send_reaction(state, session, emoji).await,
        ClientMessage::Heartbeat => {
            send_to_client(state, session, ServerMessage::Pong { now_ms: now_ms() }).await
        }
        ClientMessage::LeaveRoom => disconnect_client(state, session).await,
    }
}

async fn send_reaction(state: &AppState, session: &SessionKey, emoji: String) {
    {
        let mut inner = state.inner.lock().await;
        let Some(conn) = inner.connection(session) else {
            return;
        };
        if conn.role() != &Role::Player {
            return;
        }
        let Some(room_code) = conn.room_code_owned() else {
            return;
        };
        let Some(room) = inner.rooms.get_mut(&room_code) else {
            return;
        };
        let messages = match room.submit_reaction(session.client_id(), &emoji, now_ms()) {
            Ok(Some(burst)) => {
                let mut out = Vec::new();
                for (other_id, other_conn) in &inner.connections {
                    if other_conn.room_code() != Some(room_code.as_str()) {
                        continue;
                    }
                    let _ = other_id;
                    out.push((
                        other_conn.outbound(),
                        ServerMessage::ReactionBurst {
                            player_id: burst.player_id.clone(),
                            name: burst.name.clone(),
                            emoji: burst.emoji.clone(),
                            at_ms: burst.at_ms,
                        },
                    ));
                }
                out
            }
            Ok(None) => Vec::new(),
            Err(err) => targeted_error(&inner, session, err.code, &err.message),
        };
        deliver_many(messages);
    }
}

async fn create_room(state: &AppState, session: &SessionKey) {
    {
        let mut inner = state.inner.lock().await;
        let messages = if !matches!(
            inner.connection(session).map(Connection::role),
            Some(Role::Display)
        ) {
            targeted_error(
                &inner,
                session,
                "display_only",
                "Only the TV display can create rooms.",
            )
        } else {
            let existing: BTreeSet<String> = inner.rooms.keys().cloned().collect();
            let room_code = generate_room_code(&existing);
            let host_token = generate_host_token();
            let now = now_ms();
            let room = Room::new(
                room_code.clone(),
                session.client_id().to_string(),
                host_token.clone(),
                now,
            );
            let snapshot = room.snapshot(now);
            inner.rooms.insert(room_code.clone(), room);
            if let Some(conn) = inner.connection_mut(session) {
                conn.set_room_code(room_code.clone());
            }
            inner
                .connection(session)
                .map(|conn| {
                    vec![(
                        conn.outbound(),
                        ServerMessage::RoomCreated {
                            snapshot,
                            host_token,
                        },
                    )]
                })
                .unwrap_or_default()
        };
        deliver_many(messages);
    }
}

async fn join_room(state: &AppState, session: &SessionKey, room_code: String, name: String) {
    let room_code = room_code.to_uppercase();
    let session_token = {
        let inner = state.inner.lock().await;
        inner
            .connection(session)
            .map(|connection| connection.session_token().to_string())
    };
    let Some(session_token) = session_token else {
        return;
    };
    mutate_room(state, session, &room_code, |room| {
        room.upsert_player_with_session(
            session.client_id().to_string(),
            session_token,
            name,
            now_ms(),
        )?;
        Ok(EngineEvent::PlayerListChanged)
    })
    .await;
}

async fn set_name(state: &AppState, session: &SessionKey, name: String) {
    mutate_current_room(state, session, |room| {
        room.set_name(session.client_id(), name, now_ms())?;
        Ok(EngineEvent::PlayerListChanged)
    })
    .await;
}

async fn update_room_settings(state: &AppState, session: &SessionKey, settings: RoomSettings) {
    let Some(room_code) = authorized_controller_room_code(state, session).await else {
        send_error(
            state,
            session,
            "not_authorized",
            "Only the TV display or the host phone can change room settings.",
        )
        .await;
        return;
    };
    mutate_room(state, session, &room_code, |room| {
        room.update_settings(settings, now_ms())
    })
    .await;
}

async fn start_or_advance(state: &AppState, session: &SessionKey) {
    let Some(room_code) = authorized_controller_room_code(state, session).await else {
        send_error(
            state,
            session,
            "not_authorized",
            "Only the TV display or the host phone can advance the game.",
        )
        .await;
        return;
    };
    mutate_room(state, session, &room_code, |room| {
        room.handle_start_or_advance(now_ms())
    })
    .await;
}

async fn submit_drawing(
    state: &AppState,
    session: &SessionKey,
    turn_token: u64,
    drawing: draw_party_server::protocol::DrawingDoc,
) {
    mutate_current_room(state, session, |room| {
        room.submit_drawing(session.client_id(), turn_token, drawing, now_ms())
    })
    .await;
}

async fn submit_guess(state: &AppState, session: &SessionKey, turn_token: u64, guess: String) {
    mutate_current_room(state, session, |room| {
        room.submit_guess(session.client_id(), turn_token, guess, now_ms())
    })
    .await;
}

async fn submit_vote(state: &AppState, session: &SessionKey, turn_token: u64, option_id: String) {
    mutate_current_room(state, session, |room| {
        room.submit_vote(session.client_id(), turn_token, option_id, now_ms())
    })
    .await;
}

async fn mutate_current_room<F>(state: &AppState, session: &SessionKey, operation: F)
where
    F: FnOnce(&mut Room) -> Result<EngineEvent, EngineError>,
{
    let room_code = {
        let inner = state.inner.lock().await;
        inner
            .connection(session)
            .and_then(Connection::room_code_owned)
    };

    if let Some(room_code) = room_code {
        mutate_room(state, session, &room_code, operation).await;
    } else {
        send_error(state, session, "not_in_room", "Join a room first.").await;
    }
}

async fn mutate_room<F>(state: &AppState, session: &SessionKey, room_code: &str, operation: F)
where
    F: FnOnce(&mut Room) -> Result<EngineEvent, EngineError>,
{
    {
        let mut inner = state.inner.lock().await;
        if inner.connection(session).is_none() {
            return;
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

        let messages = match result {
            Ok(event) => {
                if let Some(conn) = inner.connection_mut(session) {
                    conn.set_room_code(room_code.to_string());
                }
                room_messages(&inner, room_code, event)
            }
            Err(error) => targeted_error(&inner, session, error.code, &error.message),
        };
        deliver_many(messages);
    }
}

async fn disconnect_client(state: &AppState, session: &SessionKey) {
    {
        let mut inner = state.inner.lock().await;
        let room_code = inner
            .remove_connection(session)
            .and_then(|conn| conn.room_code_owned());
        let messages = room_code
            .as_deref()
            .map(|room_code| inner.disconnect_room_member(room_code, session.client_id()))
            .unwrap_or_default();
        deliver_many(messages);
    }
}

fn spawn_room_maintenance(state: AppState) {
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            {
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

                let messages = changed_rooms
                    .into_iter()
                    .flat_map(|(room_code, event)| room_messages(&inner, &room_code, event))
                    .collect::<Vec<_>>();
                deliver_many(messages);
            }
        }
    });
}

fn room_messages(inner: &AppInner, room_code: &str, event: EngineEvent) -> Vec<OutboundMessage> {
    let Some(room) = inner.rooms.get(room_code) else {
        return Vec::new();
    };
    let base_snapshot = room.snapshot(now_ms());

    let mut messages = Vec::new();
    for (client_id, conn) in &inner.connections {
        if conn.room_code() != Some(room_code) {
            continue;
        }
        let snapshot = personalize_snapshot(room, &base_snapshot, client_id, conn.role());
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
        messages.push((conn.outbound(), event_message));
        messages.push((
            conn.outbound(),
            ServerMessage::RoomSnapshot {
                snapshot: snapshot.clone(),
            },
        ));

        if snapshot.phase == GamePhase::Drawing && conn.role() == &Role::Player {
            if let Some(prompt) = room.prompt_for_player(client_id) {
                messages.push((conn.outbound(), ServerMessage::PromptAssigned { prompt }));
            }
        }

        if matches!(snapshot.phase, GamePhase::Guessing | GamePhase::Voting) {
            if let (Some(artist_id), Some(artist_name), Some(drawing)) = (
                snapshot.current_artist_id.clone(),
                snapshot.current_artist_name.clone(),
                snapshot.current_drawing.clone(),
            ) {
                messages.push((
                    conn.outbound(),
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
                conn.outbound(),
                ServerMessage::VotingOptions {
                    options: snapshot.voting_options.clone(),
                },
            ));
        }

        if snapshot.phase == GamePhase::Results {
            if let Some(result) = snapshot.round_result.clone() {
                messages.push((conn.outbound(), ServerMessage::RoundResult { result }));
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

fn queue_snapshot_for_connection(inner: &AppInner, session: &SessionKey, snapshot: RoomSnapshot) {
    if let Some(conn) = inner.connection(session) {
        deliver_many(vec![(
            conn.outbound(),
            ServerMessage::RoomSnapshot { snapshot },
        )]);
    }
}

fn queue_error_for_connection(inner: &AppInner, session: &SessionKey, err: EngineError) {
    if let Some(conn) = inner.connection(session) {
        deliver_many(vec![(
            conn.outbound(),
            ServerMessage::Error {
                code: err.code.to_string(),
                message: err.message,
            },
        )]);
    }
}

async fn send_error(state: &AppState, session: &SessionKey, code: &str, message: &str) {
    send_to_client(
        state,
        session,
        ServerMessage::Error {
            code: code.to_string(),
            message: message.to_string(),
        },
    )
    .await;
}

async fn send_to_client(state: &AppState, session: &SessionKey, message: ServerMessage) {
    {
        let inner = state.inner.lock().await;
        if let Some(conn) = inner.connection(session) {
            deliver_many(vec![(conn.outbound(), message)]);
        }
    }
}

fn targeted_error(
    inner: &AppInner,
    session: &SessionKey,
    code: &str,
    message: &str,
) -> Vec<OutboundMessage> {
    inner
        .connection(session)
        .map(|conn| {
            vec![(
                conn.outbound(),
                ServerMessage::Error {
                    code: code.to_string(),
                    message: message.to_string(),
                },
            )]
        })
        .unwrap_or_default()
}

async fn authorized_controller_room_code(state: &AppState, session: &SessionKey) -> Option<String> {
    let inner = state.inner.lock().await;
    let conn = inner.connection(session)?;
    let room_code = conn.room_code()?;
    let room = inner.rooms.get(room_code)?;
    match conn.role() {
        Role::Display => {
            if room.displays.contains(session.client_id()) {
                Some(room_code.to_string())
            } else {
                None
            }
        }
        Role::Player => {
            if room.player_can_control(session.client_id()) {
                Some(room_code.to_string())
            } else {
                None
            }
        }
    }
}

fn generate_host_token() -> String {
    Uuid::new_v4().to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use serde_json::{json, Value};
    use tokio::net::TcpStream;
    use tokio_tungstenite::{
        connect_async, tungstenite::Message as WsMessage, MaybeTlsStream, WebSocketStream,
    };

    type TestSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

    async fn spawn_ws_server() -> String {
        let state = AppState {
            inner: Arc::new(Mutex::new(AppInner::default())),
        };
        let app = Router::new()
            .route("/ws", get(ws_handler))
            .with_state(state);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("ws://{addr}/ws")
    }

    async fn read_json(ws: &mut TestSocket) -> Value {
        loop {
            let message = time::timeout(Duration::from_secs(1), ws.next())
                .await
                .expect("timed out waiting for websocket message")
                .expect("websocket closed")
                .expect("websocket error");
            if let WsMessage::Text(text) = message {
                return serde_json::from_str(text.as_str()).unwrap();
            }
        }
    }

    async fn read_until_type(ws: &mut TestSocket, message_type: &str) -> Value {
        for _ in 0..10 {
            let value = read_json(ws).await;
            if value.get("type").and_then(Value::as_str) == Some(message_type) {
                return value;
            }
        }
        panic!("did not receive websocket message type {message_type}");
    }

    async fn read_until_settings_rounds(ws: &mut TestSocket, rounds: u64) -> Value {
        for _ in 0..10 {
            let value = read_json(ws).await;
            let snapshot_rounds = value
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("settings"))
                .and_then(|settings| settings.get("rounds"))
                .and_then(Value::as_u64);
            if snapshot_rounds == Some(rounds) {
                return value;
            }
        }
        panic!("did not receive websocket snapshot with {rounds} rounds");
    }

    fn text_message(value: Value) -> WsMessage {
        WsMessage::Text(value.to_string().into())
    }

    fn drawing_value() -> Value {
        json!({
            "width": 1024,
            "height": 768,
            "strokes": [{
                "color": "#111111",
                "size": 6,
                "points": [{ "x": 1, "y": 1 }, { "x": 30, "y": 35 }]
            }]
        })
    }

    async fn create_test_room(display: &mut TestSocket) -> (String, String, Value) {
        display
            .send(text_message(json!({ "type": "createRoom" })))
            .await
            .unwrap();

        let created = read_until_type(display, "roomCreated").await;
        let snapshot = created.get("snapshot").unwrap().clone();
        let room_code = snapshot
            .get("roomCode")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();
        let host_token = created
            .get("hostToken")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();
        assert_eq!(host_token.len(), 36);
        (room_code, host_token, snapshot)
    }

    async fn join_player(url: &str, room_code: &str, client_id: &str, name: &str) -> TestSocket {
        let (mut player, _) = connect_async(format!(
            "{url}?role=player&room={room_code}&clientId={client_id}&sessionToken={client_id}-session"
        ))
        .await
        .unwrap();
        player
            .send(text_message(json!({
                "type": "joinRoom",
                "roomCode": room_code,
                "name": name
            })))
            .await
            .unwrap();
        let _ = read_until_type(&mut player, "roomSnapshot").await;
        player
    }

    async fn expect_no_message(ws: &mut TestSocket) {
        assert!(
            time::timeout(Duration::from_millis(150), ws.next())
                .await
                .is_err(),
            "unexpected websocket message was received"
        );
    }

    #[tokio::test]
    async fn retiring_the_current_connection_marks_its_player_disconnected() {
        let room_code = "ABCD".to_string();
        let client_id = "slow-player".to_string();
        let now = now_ms();
        let mut room = Room::new(
            room_code.clone(),
            "display".to_string(),
            "host-token".to_string(),
            now,
        );
        let (mut connection, _rx, _close_rx) = Connection::new(
            client_id.clone(),
            Role::Player,
            "slow-player-session".to_string(),
        );
        let session = connection.key().clone();
        room.upsert_player_with_session(
            client_id.clone(),
            "slow-player-session".to_string(),
            "Ada".to_string(),
            now,
        )
        .unwrap();
        connection.set_room_code(room_code.clone());
        let state = AppState {
            inner: Arc::new(Mutex::new(AppInner {
                rooms: HashMap::from([(room_code.clone(), room)]),
                connections: HashMap::from([(client_id.clone(), connection)]),
            })),
        };

        disconnect_client(&state, &session).await;

        let inner = state.inner.lock().await;
        let snapshot = inner.rooms.get(&room_code).unwrap().snapshot(now_ms());
        assert_eq!(
            snapshot
                .players
                .iter()
                .find(|player| player.id == client_id)
                .map(|player| player.connected),
            Some(false)
        );
        assert!(!inner.connections.contains_key(&client_id));
    }

    #[test]
    fn cache_policy_matches_shell_assets_and_network_routes() {
        assert_eq!(
            cache_control_for(&Uri::from_static("/")).unwrap(),
            HeaderValue::from_static("no-cache")
        );
        assert_eq!(
            cache_control_for(&Uri::from_static("/sw.js")).unwrap(),
            HeaderValue::from_static("no-cache")
        );
        assert_eq!(
            cache_control_for(&Uri::from_static("/join/ABCD")).unwrap(),
            HeaderValue::from_static("no-cache")
        );
        assert_eq!(
            cache_control_for(&Uri::from_static("/api/health")).unwrap(),
            HeaderValue::from_static("no-store")
        );
        assert_eq!(
            cache_control_for(&Uri::from_static("/assets/index.js")).unwrap(),
            HeaderValue::from_static("public, max-age=31536000, immutable")
        );
    }

    #[test]
    fn health_response_prefers_railway_metadata_and_trims_values() {
        let values = HashMap::from([
            ("RAILWAY_GIT_COMMIT_SHA", "  railway-sha  "),
            ("GIT_SHA", "fallback-sha"),
            ("RAILWAY_GIT_BRANCH", "main"),
            ("RAILWAY_DEPLOYMENT_ID", "deployment-123"),
            ("RAILWAY_ENVIRONMENT_NAME", "production"),
        ]);

        let response =
            build_health_response(|name| values.get(name).map(|value| value.to_string()));

        assert_eq!(response.git_sha.as_deref(), Some("railway-sha"));
        assert_eq!(response.git_branch.as_deref(), Some("main"));
        assert_eq!(response.deployment_id.as_deref(), Some("deployment-123"));
        assert_eq!(response.environment_name.as_deref(), Some("production"));
    }

    #[test]
    fn health_response_omits_missing_metadata_fields() {
        let response = build_health_response(|_| None);
        let value = serde_json::to_value(response).unwrap();

        assert_eq!(value.get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            value.get("service").and_then(Value::as_str),
            Some("draw-party-server")
        );
        assert!(value.get("gitSha").is_none());
        assert!(value.get("deploymentId").is_none());
    }

    #[tokio::test]
    async fn websocket_display_updates_lobby_settings_and_players_are_rejected() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!("{url}?role=display&clientId=display"))
            .await
            .unwrap();

        let (room_code, _, snapshot) = create_test_room(&mut display).await;
        assert_eq!(
            snapshot
                .get("settings")
                .and_then(|settings| settings.get("rounds"))
                .and_then(Value::as_u64),
            Some(5)
        );
        assert!(snapshot.get("serverNowMs").and_then(Value::as_u64).unwrap() > 0);

        display
            .send(text_message(json!({
                "type": "updateRoomSettings",
                "settings": {
                    "rounds": 3,
                    "drawSeconds": 30,
                    "guessSeconds": 20,
                    "voteSeconds": 15,
                    "resultsSeconds": 12,
                    "promptPackId": "safe-party"
                }
            })))
            .await
            .unwrap();
        let updated = read_until_settings_rounds(&mut display, 3).await;
        let settings = updated
            .get("snapshot")
            .and_then(|snapshot| snapshot.get("settings"))
            .unwrap();
        assert_eq!(
            settings.get("drawSeconds").and_then(Value::as_u64),
            Some(30)
        );
        assert_eq!(
            settings.get("promptPackId").and_then(Value::as_str),
            Some("safe-party")
        );

        let (mut player, _) =
            connect_async(format!("{url}?role=player&room={room_code}&clientId=p1"))
                .await
                .unwrap();
        player
            .send(text_message(json!({
                "type": "joinRoom",
                "roomCode": room_code,
                "name": "Ada"
            })))
            .await
            .unwrap();
        let joined = read_until_type(&mut player, "roomSnapshot").await;
        let host_flag = joined
            .pointer("/snapshot/players/0/isHost")
            .and_then(Value::as_bool);
        assert_eq!(host_flag, Some(true));

        // Host phone can update settings.
        player
            .send(text_message(json!({
                "type": "updateRoomSettings",
                "settings": {
                    "rounds": 4,
                    "drawSeconds": 30,
                    "guessSeconds": 20,
                    "voteSeconds": 15,
                    "resultsSeconds": 12,
                    "promptPackId": "safe-party"
                }
            })))
            .await
            .unwrap();
        let host_updated = read_until_settings_rounds(&mut player, 4).await;
        assert_eq!(
            host_updated
                .pointer("/snapshot/settings/rounds")
                .and_then(Value::as_u64),
            Some(4)
        );

        let (mut guest, _) =
            connect_async(format!("{url}?role=player&room={room_code}&clientId=p2"))
                .await
                .unwrap();
        guest
            .send(text_message(json!({
                "type": "joinRoom",
                "roomCode": room_code,
                "name": "Grace"
            })))
            .await
            .unwrap();
        let _ = read_until_type(&mut guest, "roomSnapshot").await;
        guest
            .send(text_message(json!({
                "type": "updateRoomSettings",
                "settings": {
                    "rounds": 2,
                    "drawSeconds": 30,
                    "guessSeconds": 20,
                    "voteSeconds": 15,
                    "resultsSeconds": 12,
                    "promptPackId": "safe-party"
                }
            })))
            .await
            .unwrap();
        let error = read_until_type(&mut guest, "error").await;
        assert_eq!(
            error.get("code").and_then(Value::as_str),
            Some("not_authorized")
        );
    }

    #[tokio::test]
    async fn websocket_display_reconnect_requires_host_token() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!("{url}?role=display&clientId=display"))
            .await
            .unwrap();
        let (room_code, host_token, _) = create_test_room(&mut display).await;

        let _p1 = join_player(&url, &room_code, "p1", "Ada").await;
        let _p2 = join_player(&url, &room_code, "p2", "Grace").await;

        let (mut unauthorized, _) =
            connect_async(format!("{url}?role=display&room={room_code}&clientId=evil"))
                .await
                .unwrap();
        let error = read_until_type(&mut unauthorized, "error").await;
        assert_eq!(
            error.get("code").and_then(Value::as_str),
            Some("unauthorized_display")
        );
        unauthorized
            .send(text_message(json!({ "type": "startGame" })))
            .await
            .unwrap();
        let error = read_until_type(&mut unauthorized, "error").await;
        assert_eq!(
            error.get("code").and_then(Value::as_str),
            Some("not_authorized")
        );

        let (mut authorized, _) = connect_async(format!(
            "{url}?role=display&room={room_code}&hostToken={host_token}&clientId=display-2"
        ))
        .await
        .unwrap();
        let snapshot = read_until_type(&mut authorized, "roomSnapshot").await;
        assert_eq!(
            snapshot
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("phase"))
                .and_then(Value::as_str),
            Some("lobby")
        );

        authorized
            .send(text_message(json!({ "type": "startGame" })))
            .await
            .unwrap();
        let phase = read_until_type(&mut authorized, "phaseChanged").await;
        assert_eq!(
            phase
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("phase"))
                .and_then(Value::as_str),
            Some("drawing")
        );
        expect_no_message(&mut unauthorized).await;
    }

    #[tokio::test]
    async fn websocket_replacement_closes_the_superseded_connection() {
        let url = spawn_ws_server().await;
        let (mut original, _) = connect_async(format!(
            "{url}?role=display&clientId=display&sessionToken=display-session"
        ))
        .await
        .unwrap();
        let (room_code, host_token, _) = create_test_room(&mut original).await;

        let (mut replacement, _) = connect_async(format!(
            "{url}?role=display&room={room_code}&hostToken={host_token}&clientId=display&sessionToken=display-session"
        ))
        .await
        .unwrap();
        let snapshot = read_until_type(&mut replacement, "roomSnapshot").await;
        assert_eq!(
            snapshot
                .pointer("/snapshot/roomCode")
                .and_then(Value::as_str),
            Some(room_code.as_str())
        );

        let closed = time::timeout(Duration::from_secs(1), original.next())
            .await
            .expect("superseded socket did not terminate");
        assert!(matches!(
            closed,
            Some(Ok(WsMessage::Close(_))) | Some(Err(_)) | None
        ));

        replacement
            .send(text_message(json!({ "type": "heartbeat" })))
            .await
            .unwrap();
        assert!(read_until_type(&mut replacement, "pong")
            .await
            .get("nowMs")
            .and_then(Value::as_u64)
            .is_some());
    }

    #[tokio::test]
    async fn websocket_rejects_a_second_socket_that_claims_the_host_player_id() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!(
            "{url}?role=display&clientId=display&sessionToken=display-session"
        ))
        .await
        .unwrap();
        let (room_code, _, _) = create_test_room(&mut display).await;
        let mut host = join_player(&url, &room_code, "host-phone", "Ada").await;

        let (mut attacker, _) = connect_async(format!(
            "{url}?role=player&room={room_code}&clientId=host-phone&sessionToken=attacker-session"
        ))
        .await
        .unwrap();
        let error = read_until_type(&mut attacker, "error").await;
        assert_eq!(
            error.get("code").and_then(Value::as_str),
            Some("session_in_use")
        );

        host.send(text_message(json!({
            "type": "updateRoomSettings",
            "settings": {
                "rounds": 3,
                "drawSeconds": 30,
                "guessSeconds": 20,
                "voteSeconds": 15,
                "resultsSeconds": 12,
                "promptPackId": "safe-party"
            }
        })))
        .await
        .unwrap();
        let updated = read_until_settings_rounds(&mut host, 3).await;
        assert_eq!(
            updated
                .pointer("/snapshot/settings/rounds")
                .and_then(Value::as_u64),
            Some(3)
        );
    }

    #[tokio::test]
    async fn websocket_invalid_reclaim_does_not_reserve_a_disconnected_player_id() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!(
            "{url}?role=display&clientId=display&sessionToken=display-session"
        ))
        .await
        .unwrap();
        let (room_code, _, _) = create_test_room(&mut display).await;
        let mut host = join_player(&url, &room_code, "host-phone", "Ada").await;

        host.send(text_message(json!({ "type": "leaveRoom" })))
            .await
            .unwrap();
        let _ = read_until_type(&mut display, "playerListChanged").await;

        let (mut attacker, _) = connect_async(format!(
            "{url}?role=player&room={room_code}&clientId=host-phone&sessionToken=attacker-session"
        ))
        .await
        .unwrap();
        let error = read_until_type(&mut attacker, "error").await;
        assert_eq!(
            error.get("code").and_then(Value::as_str),
            Some("invalid_player_session")
        );

        let mut restored = join_player(&url, &room_code, "host-phone", "Ada").await;
        restored
            .send(text_message(json!({
                "type": "updateRoomSettings",
                "settings": {
                    "rounds": 3,
                    "drawSeconds": 30,
                    "guessSeconds": 20,
                    "voteSeconds": 15,
                    "resultsSeconds": 12,
                    "promptPackId": "safe-party"
                }
            })))
            .await
            .unwrap();
        let updated = read_until_settings_rounds(&mut restored, 3).await;
        assert_eq!(
            updated
                .pointer("/snapshot/settings/rounds")
                .and_then(Value::as_u64),
            Some(3)
        );
    }

    #[tokio::test]
    async fn websocket_replacement_into_another_room_disconnects_the_old_room_player() {
        let url = spawn_ws_server().await;
        let (mut display_a, _) = connect_async(format!(
            "{url}?role=display&clientId=display-a&sessionToken=display-a-session"
        ))
        .await
        .unwrap();
        let (room_a, _, _) = create_test_room(&mut display_a).await;
        let _player_a = join_player(&url, &room_a, "player", "Ada").await;
        let _ = read_until_type(&mut display_a, "playerListChanged").await;

        let (mut display_b, _) = connect_async(format!(
            "{url}?role=display&clientId=display-b&sessionToken=display-b-session"
        ))
        .await
        .unwrap();
        let (room_b, _, _) = create_test_room(&mut display_b).await;

        let (mut player_b, _) = connect_async(format!(
            "{url}?role=player&room={room_b}&clientId=player&sessionToken=player-session"
        ))
        .await
        .unwrap();
        player_b
            .send(text_message(json!({
                "type": "joinRoom",
                "roomCode": room_b,
                "name": "Ada"
            })))
            .await
            .unwrap();
        let _ = read_until_type(&mut player_b, "roomSnapshot").await;

        let disconnected = read_until_type(&mut display_a, "playerListChanged").await;
        assert_eq!(
            disconnected
                .pointer("/players/0/connected")
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[tokio::test]
    async fn websocket_late_join_becomes_spectator_and_receives_room_updates() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!("{url}?role=display&clientId=display"))
            .await
            .unwrap();
        let (room_code, _, _) = create_test_room(&mut display).await;

        let mut p1 = join_player(&url, &room_code, "p1", "Ada").await;
        let mut p2 = join_player(&url, &room_code, "p2", "Grace").await;

        display
            .send(text_message(json!({ "type": "startGame" })))
            .await
            .unwrap();
        let phase = read_until_type(&mut display, "phaseChanged").await;
        let turn_token = phase
            .get("snapshot")
            .and_then(|snapshot| snapshot.get("turnToken"))
            .and_then(Value::as_u64)
            .unwrap();

        let (mut late, _) =
            connect_async(format!("{url}?role=player&room={room_code}&clientId=p3"))
                .await
                .unwrap();
        late.send(text_message(json!({
            "type": "joinRoom",
            "roomCode": room_code,
            "name": "Linus"
        })))
        .await
        .unwrap();
        let joined = read_until_type(&mut late, "roomSnapshot").await;
        let spectator = joined
            .get("snapshot")
            .and_then(|snapshot| snapshot.get("players"))
            .and_then(Value::as_array)
            .and_then(|players| {
                players
                    .iter()
                    .find(|player| player.get("id").and_then(Value::as_str) == Some("p3"))
            })
            .and_then(|player| player.get("spectator"))
            .and_then(Value::as_bool);
        assert_eq!(spectator, Some(true));

        p1.send(text_message(json!({
            "type": "submitDrawing",
            "turnToken": turn_token,
            "drawing": drawing_value()
        })))
        .await
        .unwrap();
        p2.send(text_message(json!({
            "type": "submitDrawing",
            "turnToken": turn_token,
            "drawing": drawing_value()
        })))
        .await
        .unwrap();

        let update = read_until_type(&mut late, "phaseChanged").await;
        assert_eq!(
            update
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("phase"))
                .and_then(Value::as_str),
            Some("guessing")
        );
    }

    #[tokio::test]
    async fn websocket_player_dropout_during_drawing_does_not_stall_room() {
        let url = spawn_ws_server().await;
        let (mut display, _) = connect_async(format!("{url}?role=display&clientId=display"))
            .await
            .unwrap();
        let (room_code, _, _) = create_test_room(&mut display).await;

        let mut p1 = join_player(&url, &room_code, "p1", "Ada").await;
        let mut p2 = join_player(&url, &room_code, "p2", "Grace").await;
        let mut p3 = join_player(&url, &room_code, "p3", "Linus").await;

        display
            .send(text_message(json!({ "type": "startGame" })))
            .await
            .unwrap();
        let phase = read_until_type(&mut display, "phaseChanged").await;
        assert_eq!(
            phase
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("phase"))
                .and_then(Value::as_str),
            Some("drawing")
        );
        let turn_token = phase
            .get("snapshot")
            .and_then(|snapshot| snapshot.get("turnToken"))
            .and_then(Value::as_u64)
            .unwrap();

        p3.send(WsMessage::Close(None)).await.unwrap();

        for player in [&mut p1, &mut p2] {
            player
                .send(text_message(json!({
                    "type": "submitDrawing",
                    "turnToken": turn_token,
                    "drawing": drawing_value()
                })))
                .await
                .unwrap();
        }

        let phase = read_until_type(&mut display, "phaseChanged").await;
        assert_eq!(
            phase
                .get("snapshot")
                .and_then(|snapshot| snapshot.get("phase"))
                .and_then(Value::as_str),
            Some("guessing")
        );
    }
}
