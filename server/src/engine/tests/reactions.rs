use super::super::*;
use super::helpers::*;

#[test]
fn submit_reaction_rules_and_cooldown() {
    let mut room = room_with_players();
    assert!(room.submit_reaction("p1", "😂", 50).unwrap().is_none());

    reach_guessing(&mut room, 100);
    assert_eq!(
        room.submit_reaction("p1", "🙂", 300).unwrap_err().code,
        "invalid_reaction"
    );
    assert_eq!(
        room.submit_reaction("missing", "😂", 301).unwrap_err().code,
        "not_joined"
    );

    // Regression: never-reacted players (last_reaction_ms == 0) must be allowed immediately.
    let burst = room.submit_reaction("p1", "😂", 302).unwrap().unwrap();
    assert_eq!(burst.emoji, "😂");
    assert_eq!(burst.player_id, "p1");
    assert!(room
        .submit_reaction("p1", "🔥", 302 + REACTION_COOLDOWN_MS - 1)
        .unwrap()
        .is_none());
    assert!(room
        .submit_reaction("p1", "🔥", 302 + REACTION_COOLDOWN_MS)
        .unwrap()
        .is_some());

    room.mark_disconnected("p1", 900);
    assert!(room.submit_reaction("p1", "👏", 1000).unwrap().is_none());
}
