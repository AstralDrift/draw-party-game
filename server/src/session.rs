use draw_party_server::protocol::{Role, ServerMessage};
use tokio::sync::{mpsc, watch};
use uuid::Uuid;

pub const OUTBOUND_QUEUE_CAPACITY: usize = 16;

/// Identifies one socket generation for a logical browser client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionKey {
    client_id: String,
    generation: Uuid,
}

impl SessionKey {
    pub fn new(client_id: String) -> Self {
        Self {
            client_id,
            generation: Uuid::new_v4(),
        }
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }
}

pub struct Connection {
    key: SessionKey,
    role: Role,
    room_code: Option<String>,
    session_token: String,
    outbound: OutboundTarget,
}

impl Connection {
    pub fn new(
        client_id: String,
        role: Role,
        session_token: String,
    ) -> (Self, mpsc::Receiver<ServerMessage>, watch::Receiver<bool>) {
        let (tx, rx) = mpsc::channel(OUTBOUND_QUEUE_CAPACITY);
        let (close_tx, close_rx) = watch::channel(false);
        let outbound = OutboundTarget { tx, close_tx };
        (
            Self {
                key: SessionKey::new(client_id),
                role,
                room_code: None,
                session_token,
                outbound,
            },
            rx,
            close_rx,
        )
    }

    pub fn matches(&self, key: &SessionKey) -> bool {
        self.key == *key
    }

    pub fn key(&self) -> &SessionKey {
        &self.key
    }

    pub fn role(&self) -> &Role {
        &self.role
    }

    pub fn room_code(&self) -> Option<&str> {
        self.room_code.as_deref()
    }

    pub fn room_code_owned(&self) -> Option<String> {
        self.room_code.clone()
    }

    pub fn accepts_session_token(&self, session_token: &str) -> bool {
        self.session_token == session_token
    }

    pub fn session_token(&self) -> &str {
        &self.session_token
    }

    pub fn set_room_code(&mut self, room_code: String) {
        self.room_code = Some(room_code);
    }

    pub fn outbound(&self) -> OutboundTarget {
        self.outbound.clone()
    }

    pub fn retire(&self) {
        self.outbound.retire();
    }
}

#[derive(Clone)]
pub struct OutboundTarget {
    tx: mpsc::Sender<ServerMessage>,
    close_tx: watch::Sender<bool>,
}

impl OutboundTarget {
    pub fn deliver(&self, message: ServerMessage) {
        if self.tx.try_send(message).is_err() {
            self.retire();
        }
    }

    fn retire(&self) {
        let _ = self.close_tx.send(true);
    }
}

pub type OutboundMessage = (OutboundTarget, ServerMessage);

pub fn deliver_many(messages: impl IntoIterator<Item = OutboundMessage>) {
    for (target, message) in messages {
        target.deliver(message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bounded_delivery_retires_only_the_slow_connection() {
        let (slow_tx, mut slow_rx) = mpsc::channel(1);
        let (slow_close_tx, mut slow_close_rx) = watch::channel(false);
        let slow_target = OutboundTarget {
            tx: slow_tx,
            close_tx: slow_close_tx,
        };

        let (healthy_tx, mut healthy_rx) = mpsc::channel(2);
        let (healthy_close_tx, healthy_close_rx) = watch::channel(false);
        let healthy_target = OutboundTarget {
            tx: healthy_tx,
            close_tx: healthy_close_tx,
        };

        deliver_many(vec![
            (slow_target.clone(), ServerMessage::Pong { now_ms: 1 }),
            (slow_target, ServerMessage::Pong { now_ms: 2 }),
            (healthy_target, ServerMessage::Pong { now_ms: 3 }),
        ]);

        assert!(matches!(
            slow_rx.try_recv(),
            Ok(ServerMessage::Pong { now_ms: 1 })
        ));
        slow_close_rx.changed().await.unwrap();
        assert!(*slow_close_rx.borrow());
        assert!(matches!(
            healthy_rx.try_recv(),
            Ok(ServerMessage::Pong { now_ms: 3 })
        ));
        assert!(!*healthy_close_rx.borrow());
    }
}
