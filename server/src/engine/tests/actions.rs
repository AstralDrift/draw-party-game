use super::helpers::*;
use super::super::*;

#[test]
fn rejects_stale_guess_in_drawing_phase() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let err = room
        .submit_guess("p1", room.turn_token, "too soon".to_string(), 101)
        .unwrap_err();
    assert_eq!(err.code, "invalid_phase");
}

#[test]
fn rejects_stale_same_phase_turn_token() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let stale_token = room.turn_token.saturating_sub(1);
    let err = room
        .submit_drawing("p1", stale_token, drawing(), 200)
        .unwrap_err();
    assert_eq!(err.code, "stale_turn");
}

#[test]
fn artist_cannot_guess_during_guessing_phase() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    assert_eq!(
        room.submit_guess(&artist, room.turn_token, "nope".to_string(), 300)
            .unwrap_err()
            .code,
        "artist_action"
    );
}

#[test]
fn artist_cannot_vote_on_own_drawing() {
    let mut room = room_with_players();
    let _voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    assert_eq!(
        room.submit_vote(&artist, room.turn_token, truth_option_id(&room), 401)
            .unwrap_err()
            .code,
        "artist_action"
    );
}

#[test]
fn vote_rejects_unknown_option_id() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    assert_eq!(
        room.submit_vote(&voters[0], room.turn_token, "missing-option".to_string(), 402)
            .unwrap_err()
            .code,
        "invalid_vote"
    );
}

#[test]
fn vote_rejects_own_fake_answer() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    assert_eq!(
        room.submit_vote(
            &voters[0],
            room.turn_token,
            fake_option_id_for(&room, &voters[0]),
            403
        )
        .unwrap_err()
        .code,
        "own_guess"
    );
}

#[test]
fn vote_rejected_outside_voting_phase() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(
        room.submit_vote("p1", room.turn_token, "option-0".to_string(), 101)
            .unwrap_err()
            .code,
        "invalid_phase"
    );
}

#[test]
fn start_or_advance_rejected_during_drawing() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(
        room.handle_start_or_advance(102).unwrap_err().code,
        "invalid_phase"
    );
}

#[test]
fn drawing_rejected_during_voting() {
    let mut room = room_with_players();
    reach_voting(&mut room, 200);
    assert_eq!(
        room.submit_drawing("p1", room.turn_token, drawing(), 300)
            .unwrap_err()
            .code,
        "invalid_phase"
    );
}

#[test]
fn set_name_requires_joined_player() {
    let mut room = room_with_players();
    assert_eq!(
        room.set_name("ghost", "Nope".to_string(), 103)
            .unwrap_err()
            .code,
        "not_joined"
    );
}

#[test]
fn empty_guess_is_rejected() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    assert_eq!(
        room.submit_guess(&voters[0], room.turn_token, "   ".to_string(), 300)
            .unwrap_err()
            .code,
        "empty_guess"
    );
}

#[test]
fn stale_guess_token_fails_after_phase_advances() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let stale = room.turn_token;
    room.mark_disconnected(&voters[1], 310);
    room.submit_guess(&voters[0], stale, "only one".to_string(), 320)
        .unwrap();
    assert_ne!(room.phase, GamePhase::Guessing);
    assert_eq!(
        room.submit_guess(&voters[0], stale, "late".to_string(), 330)
            .unwrap_err()
            .code,
        "invalid_phase"
    );
}

#[test]
fn voting_snapshot_redacts_correctness_and_authors() {
    let mut room = room_with_players();
    reach_voting(&mut room, 100);
    let snap = room.snapshot(500);
    assert!(!snap.voting_options.is_empty());
    for option in &snap.voting_options {
        assert!(!option.is_correct);
        assert!(option.author_player_id.is_none());
        assert!(option.author_name.is_none());
    }
    assert!(room
        .round
        .voting_options
        .iter()
        .any(|option| option.is_correct));
}
