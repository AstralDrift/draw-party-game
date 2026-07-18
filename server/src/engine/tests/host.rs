use super::super::Room;

#[test]
fn first_player_becomes_host_and_reassigns_on_disconnect() {
    let mut room = Room::new(
        "HOST".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    assert_eq!(room.host_player_id.as_deref(), Some("p1"));
    assert!(room.player_can_control("p1"));
    assert!(
        room.snapshot(1)
            .players
            .iter()
            .find(|p| p.id == "p1")
            .unwrap()
            .is_host
    );

    room.upsert_player("p2".to_string(), "Grace".to_string(), 2)
        .unwrap();
    assert_eq!(room.host_player_id.as_deref(), Some("p1"));
    assert!(!room.player_can_control("p2"));
    assert!(
        !room
            .snapshot(2)
            .players
            .iter()
            .find(|p| p.id == "p2")
            .unwrap()
            .is_host
    );

    room.mark_disconnected("p1", 3);
    assert_eq!(room.host_player_id.as_deref(), Some("p2"));
    assert!(room.player_can_control("p2"));
    assert!(
        room.snapshot(3)
            .players
            .iter()
            .find(|p| p.id == "p2")
            .unwrap()
            .is_host
    );
}

#[test]
fn host_succession_uses_join_order_not_player_id_order() {
    let mut room = Room::new(
        "HOST".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    room.upsert_player("p3".to_string(), "Linus".to_string(), 2)
        .unwrap();
    room.upsert_player("p2".to_string(), "Grace".to_string(), 3)
        .unwrap();

    room.mark_disconnected("p1", 4);
    assert_eq!(room.host_player_id.as_deref(), Some("p3"));
    assert!(room.player_can_control("p3"));
}

#[test]
fn reconnecting_a_player_requires_its_original_session_token() {
    let mut room = Room::new(
        "HOST".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    room.upsert_player_with_session(
        "p1".to_string(),
        "private-session".to_string(),
        "Ada".to_string(),
        1,
    )
    .unwrap();
    room.mark_disconnected("p1", 2);

    let error = room
        .upsert_player_with_session(
            "p1".to_string(),
            "attacker-session".to_string(),
            "Mallory".to_string(),
            3,
        )
        .unwrap_err();

    assert_eq!(error.code, "invalid_player_session");
    let player = room.players.get("p1").unwrap();
    assert_eq!(player.name, "Ada");
    assert!(!player.connected);
}
