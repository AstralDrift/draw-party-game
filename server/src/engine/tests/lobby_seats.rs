use super::super::*;

fn full_lobby() -> Room {
    let mut room = Room::new("FULL".into(), "display".into(), "host-token".into(), 0);
    for index in 0..MAX_PLAYERS {
        room.upsert_player(format!("p{index}"), format!("Player {index}"), index as u64)
            .unwrap();
    }
    room
}

#[test]
fn full_fresh_lobby_reclaims_only_one_seat_at_the_grace_boundary() {
    let mut room = full_lobby();
    room.mark_disconnected("p0", 100);
    room.mark_disconnected("p1", 100);
    assert_eq!(
        room.upsert_player("new".into(), "New".into(), 60_099)
            .unwrap_err()
            .code,
        "room_full"
    );
    assert!(room.players.contains_key("p0"));

    room.upsert_player("new".into(), "New".into(), 60_100)
        .unwrap();
    assert_eq!(room.players.len(), MAX_PLAYERS);
    assert!(!room.players.contains_key("p0"));
    assert!(room.players.contains_key("p1"));
    assert!(!room.players["new"].spectator);
    assert_eq!(room.players["new"].disconnected_at_ms, None);
}

#[test]
fn lobby_reclaims_by_disconnect_time_then_join_time_then_id() {
    let mut room = full_lobby();
    room.mark_disconnected("p0", 200);
    room.mark_disconnected("p1", 100);
    room.mark_disconnected("p2", 100);
    room.mark_disconnected("p3", 100);
    room.players.get_mut("p2").unwrap().joined_at_ms = 0;
    room.players.get_mut("p3").unwrap().joined_at_ms = 0;
    for (index, removed_id) in ["p2", "p3", "p1", "p0"].into_iter().enumerate() {
        room.upsert_player(format!("new-{index}"), "New".into(), 60_200)
            .unwrap();
        assert!(!room.players.contains_key(removed_id));
        assert_eq!(room.players.len(), MAX_PLAYERS);
    }
}

#[test]
fn duplicate_disconnect_keeps_grace_start_and_reconnect_resets_it() {
    let mut room = full_lobby();
    room.mark_disconnected("p0", 100);
    room.mark_disconnected("p0", 200);
    assert_eq!(room.players["p0"].disconnected_at_ms, Some(100));

    room.upsert_player("p0".into(), "Back".into(), 60_100)
        .unwrap();
    assert_eq!(room.players["p0"].disconnected_at_ms, None);
    assert_eq!(room.players["p0"].name, "Player 0");
    assert_eq!(
        room.upsert_player("new".into(), "New".into(), 60_100)
            .unwrap_err()
            .code,
        "room_full"
    );
    room.mark_disconnected("p0", 60_101);
    assert_eq!(
        room.upsert_player("new".into(), "New".into(), 120_100)
            .unwrap_err()
            .code,
        "room_full"
    );
    room.upsert_player("new".into(), "New".into(), 120_101)
        .unwrap();
    assert!(!room.players.contains_key("p0"));
}

#[test]
fn wrong_session_cannot_reconnect_or_reclaim_an_existing_identity() {
    let mut room = full_lobby();
    room.mark_disconnected("p0", 100);
    assert_eq!(
        room.upsert_player_with_session("p0".into(), "wrong-token".into(), "New".into(), 60_100)
            .unwrap_err()
            .code,
        "invalid_player_session"
    );
    assert_eq!(room.players["p0"].disconnected_at_ms, Some(100));
    assert!(!room.players["p0"].connected);
    assert_eq!(room.players.len(), MAX_PLAYERS);
}

#[test]
fn lobby_keeps_departed_players_when_capacity_is_available() {
    let mut room = full_lobby();
    room.players.remove("p7");
    room.mark_disconnected("p0", 100);
    room.upsert_player("new".into(), "New".into(), 60_100)
        .unwrap();
    assert!(room.players.contains_key("p0"));
    assert_eq!(room.players.len(), MAX_PLAYERS);
}

#[test]
fn active_game_keeps_departed_seats_past_lobby_grace_period() {
    let mut room = full_lobby();
    room.handle_start_or_advance(100).unwrap();
    room.mark_disconnected("p0", 101);
    assert_eq!(
        room.upsert_player("new".into(), "New".into(), 60_101)
            .unwrap_err()
            .code,
        "room_full"
    );
    assert!(room.players.contains_key("p0"));
    assert!(room.round.prompts.contains_key("p0"));
}

#[test]
fn missing_legacy_disconnect_timestamp_does_not_reclaim_a_seat() {
    let mut room = full_lobby();
    let mut serialized = serde_json::to_value(&room.players["p0"]).unwrap();
    serialized
        .as_object_mut()
        .unwrap()
        .remove("disconnected_at_ms");
    serialized["connected"] = serde_json::json!(false);
    let player: Player = serde_json::from_value(serialized).unwrap();
    assert_eq!(player.disconnected_at_ms, None);
    room.players.insert("p0".into(), player);
    assert_eq!(
        room.upsert_player("new".into(), "New".into(), 100_000)
            .unwrap_err()
            .code,
        "room_full"
    );
}
