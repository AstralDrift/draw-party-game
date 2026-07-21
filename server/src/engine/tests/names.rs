use super::super::*;
use super::helpers::room_with_players;

fn empty_room() -> Room {
    Room::new(
        "NAME".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    )
}

#[test]
fn case_insensitive_join_collisions_suffix_only_the_new_player() {
    let mut room = empty_room();
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    room.upsert_player("p2".to_string(), "ada".to_string(), 2)
        .unwrap();
    room.upsert_player("p3".to_string(), "ADA".to_string(), 3)
        .unwrap();

    assert_eq!(room.players.get("p1").unwrap().name, "Ada");
    assert_eq!(room.players.get("p2").unwrap().name, "ada 2");
    assert_eq!(room.players.get("p3").unwrap().name, "ADA 3");
}

#[test]
fn reconnect_preserves_canonical_name_and_disconnected_name_stays_reserved() {
    let mut room = empty_room();
    room.upsert_player_with_session(
        "p1".to_string(),
        "p1-session".to_string(),
        "Ada".to_string(),
        1,
    )
    .unwrap();
    room.mark_disconnected("p1", 2);

    room.upsert_player("p2".to_string(), "aDa".to_string(), 3)
        .unwrap();
    assert_eq!(room.players.get("p2").unwrap().name, "aDa 2");

    room.upsert_player_with_session(
        "p1".to_string(),
        "p1-session".to_string(),
        "Mallory".to_string(),
        4,
    )
    .unwrap();
    assert_eq!(room.players.get("p1").unwrap().name, "Ada");
    assert!(room.players.get("p1").unwrap().connected);
}

#[test]
fn explicit_rename_excludes_self_and_never_renumbers_existing_players() {
    let mut room = empty_room();
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    room.upsert_player("p2".to_string(), "Grace".to_string(), 2)
        .unwrap();

    room.set_name("p2", "ADA".to_string(), 3).unwrap();
    assert_eq!(room.players.get("p1").unwrap().name, "Ada");
    assert_eq!(room.players.get("p2").unwrap().name, "ADA 2");

    room.set_name("p2", "ada".to_string(), 4).unwrap();
    assert_eq!(room.players.get("p1").unwrap().name, "Ada");
    assert_eq!(room.players.get("p2").unwrap().name, "ada 2");
}

#[test]
fn spectators_also_reserve_case_insensitive_names() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("p4".to_string(), "ada".to_string(), 101)
        .unwrap();
    room.upsert_player("p5".to_string(), "ADA".to_string(), 102)
        .unwrap();

    assert!(room.players.get("p4").unwrap().spectator);
    assert!(room.players.get("p5").unwrap().spectator);
    assert_eq!(room.players.get("p4").unwrap().name, "ada 2");
    assert_eq!(room.players.get("p5").unwrap().name, "ADA 3");
}

#[test]
fn suffix_truncates_a_max_length_name_without_exceeding_the_limit() {
    let mut room = empty_room();
    let uppercase = "A".repeat(MAX_NAME_LEN);
    let lowercase = "a".repeat(MAX_NAME_LEN);
    room.upsert_player("p1".to_string(), uppercase.clone(), 1)
        .unwrap();
    room.upsert_player("p2".to_string(), uppercase.clone(), 2)
        .unwrap();
    room.upsert_player("p3".to_string(), lowercase, 3).unwrap();

    let second = &room.players.get("p2").unwrap().name;
    let third = &room.players.get("p3").unwrap().name;
    assert_eq!(second, &format!("{} 2", "A".repeat(MAX_NAME_LEN - 2)));
    assert_eq!(third, &format!("{} 3", "a".repeat(MAX_NAME_LEN - 2)));
    assert_eq!(second.chars().count(), MAX_NAME_LEN);
    assert_eq!(third.chars().count(), MAX_NAME_LEN);
}
