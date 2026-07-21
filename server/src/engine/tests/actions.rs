use super::super::*;
use super::helpers::*;

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
fn drawing_submission_obeys_deadline_boundary() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let turn_token = room.turn_token;
    let deadline = room.deadline_ms.expect("drawing deadline");

    room.submit_drawing("p1", turn_token, drawing(), deadline - 1)
        .unwrap();
    let before_late_submission = room.clone();

    for now_ms in [deadline, deadline + 1] {
        let error = room
            .submit_drawing("p2", turn_token, drawing(), now_ms)
            .unwrap_err();
        assert_eq!(error.code, "deadline_expired");
        assert_eq!(
            error.message,
            "Time is up for this turn. Wait for the next action."
        );
        assert_eq!(room, before_late_submission);
    }
}

#[test]
fn guess_submission_obeys_deadline_boundary() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let turn_token = room.turn_token;
    let deadline = room.deadline_ms.expect("guessing deadline");

    room.submit_guess(
        &voters[0],
        turn_token,
        "before the buzzer".to_string(),
        deadline - 1,
    )
    .unwrap();
    let before_late_submission = room.clone();

    for now_ms in [deadline, deadline + 1] {
        let error = room
            .submit_guess(
                &voters[1],
                turn_token,
                "after the buzzer".to_string(),
                now_ms,
            )
            .unwrap_err();
        assert_eq!(error.code, "deadline_expired");
        assert_eq!(
            error.message,
            "Time is up for this turn. Wait for the next action."
        );
        assert_eq!(room, before_late_submission);
    }
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
        room.submit_vote(
            &voters[0],
            room.turn_token,
            "missing-option".to_string(),
            402
        )
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
fn vote_submission_obeys_deadline_boundary_without_late_scoring() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let turn_token = room.turn_token;
    let deadline = room.deadline_ms.expect("voting deadline");
    let truth = truth_option_id(&room);

    room.submit_vote(&voters[0], turn_token, truth.clone(), deadline - 1)
        .unwrap();
    let before_late_submission = room.clone();

    for now_ms in [deadline, deadline + 1] {
        let error = room
            .submit_vote(&voters[1], turn_token, truth.clone(), now_ms)
            .unwrap_err();
        assert_eq!(error.code, "deadline_expired");
        assert_eq!(
            error.message,
            "Time is up for this turn. Wait for the next action."
        );
        assert_eq!(room, before_late_submission);
    }
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
fn deadline_can_be_extended_once_per_timed_turn() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let original_deadline = room.deadline_ms.unwrap();
    assert!(room.snapshot(101).deadline_extension_available);

    room.extend_deadline(200).unwrap();

    assert_eq!(room.deadline_ms, Some(original_deadline + 30_000));
    assert!(!room.snapshot(201).deadline_extension_available);
    assert_eq!(
        room.extend_deadline(202).unwrap_err().code,
        "deadline_extension_used"
    );
}

#[test]
fn deadline_extension_resets_for_each_guessing_and_voting_turn() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.extend_deadline(150).unwrap();
    submit_all_drawings(&mut room, 200);
    assert_eq!(room.phase, GamePhase::Guessing);
    assert!(room.snapshot(201).deadline_extension_available);

    room.extend_deadline(202).unwrap();
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "fake one".to_string(), 203)
        .unwrap();
    room.submit_guess(&voters[1], token, "fake two".to_string(), 204)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Voting);
    assert!(room.snapshot(205).deadline_extension_available);
}

#[test]
fn expired_or_untimed_phase_cannot_be_extended() {
    let mut room = room_with_players();
    assert_eq!(room.extend_deadline(50).unwrap_err().code, "invalid_phase");
    room.handle_start_or_advance(100).unwrap();
    let deadline = room.deadline_ms.unwrap();

    assert_eq!(
        room.extend_deadline(deadline).unwrap_err().code,
        "deadline_expired"
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
