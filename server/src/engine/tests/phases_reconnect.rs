use super::super::*;
use super::helpers::*;
use std::collections::BTreeSet;

#[test]
fn starts_drawing_with_unique_prompts() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.round.prompts.len(), 3);
    assert_eq!(room.round.order.len(), 3);
    assert_eq!(room.deadline_ms, Some(100 + 75_000));
}

#[test]
fn blocks_duplicate_draw_guess_and_vote_submissions() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    assert_eq!(
        room.submit_drawing("p1", drawing_token, drawing(), 201)
            .unwrap_err()
            .code,
        "duplicate_submission"
    );

    room.submit_drawing("p2", drawing_token, drawing(), 202)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 203)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);

    let guess_token = room.turn_token;
    let voters = non_artist_ids(&room);
    room.submit_guess(&voters[0], guess_token, "first fake".to_string(), 300)
        .unwrap();
    assert_eq!(
        room.submit_guess(&voters[0], guess_token, "second fake".to_string(), 301)
            .unwrap_err()
            .code,
        "duplicate_submission"
    );

    room.submit_guess(&voters[1], guess_token, "other fake".to_string(), 302)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);

    let vote_token = room.turn_token;
    let truth = truth_option_id(&room);
    room.submit_vote(&voters[0], vote_token, truth.clone(), 400)
        .unwrap();
    assert_eq!(
        room.submit_vote(&voters[0], vote_token, truth, 401)
            .unwrap_err()
            .code,
        "duplicate_submission"
    );
}

#[test]
fn drawing_disconnect_advances_when_connected_players_are_done() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let token = room.turn_token;
    room.submit_drawing("p1", token, drawing(), 200).unwrap();
    room.submit_drawing("p2", token, drawing(), 201).unwrap();
    room.mark_disconnected("p3", 202);
    let event = room.advance_if_ready(202).unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.round.drawings.len(), 2);
}

#[test]
fn guessing_counts_only_connected_non_artists() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    room.mark_disconnected(&voters[1], 250);
    let event = room
        .submit_guess(
            &voters[0],
            room.turn_token,
            "only connected fake".to_string(),
            300,
        )
        .unwrap();
    assert_eq!(event, EngineEvent::PhaseChanged);
    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(room.round.guesses.len(), 1);
}

#[test]
fn voting_counts_only_connected_non_artists() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    room.mark_disconnected(&voters[1], 350);
    let event = room
        .submit_vote(&voters[0], room.turn_token, truth_option_id(&room), 400)
        .unwrap();
    assert_eq!(event, EngineEvent::PhaseChanged);
    assert_eq!(room.phase, GamePhase::Results);
    assert_eq!(room.round.votes.len(), 1);
}

#[test]
fn disconnected_players_cannot_submit_current_turn_actions() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.mark_disconnected("p3", 150);
    assert_eq!(
        room.submit_drawing("p3", room.turn_token, drawing(), 151)
            .unwrap_err()
            .code,
        "not_connected"
    );

    room.upsert_player("p3".to_string(), "Linus".to_string(), 160)
        .unwrap();
    submit_all_drawings(&mut room, 200);
    let voters = non_artist_ids(&room);
    room.mark_disconnected(&voters[0], 250);
    assert_eq!(
        room.submit_guess(&voters[0], room.turn_token, "late fake".to_string(), 251)
            .unwrap_err()
            .code,
        "not_connected"
    );

    room.submit_guess(
        &voters[1],
        room.turn_token,
        "connected fake".to_string(),
        252,
    )
    .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(
        room.submit_vote(&voters[0], room.turn_token, truth_option_id(&room), 253)
            .unwrap_err()
            .code,
        "not_connected"
    );
}

#[test]
fn results_deadline_auto_advances_to_next_artist() {
    let mut room = room_with_players();
    room.update_settings(custom_settings(), 50).unwrap();
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);
    let artist = room.round.current_artist_id.clone().unwrap();
    play_guesses_then_vote_truth(&mut room, 300);
    let deadline = room.deadline_ms.expect("results deadline");
    let event = room.advance_if_expired(deadline).unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_ne!(
        room.round.current_artist_id.as_deref(),
        Some(artist.as_str())
    );
}

#[test]
fn results_continue_reveals_all_submitted_drawings_before_next_round() {
    let mut room = room_with_players();
    room.update_settings(custom_settings(), 50).unwrap();
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);

    let mut revealed_artists = BTreeSet::new();
    for _ in 0..3 {
        assert_eq!(room.phase, GamePhase::Guessing);
        revealed_artists.insert(room.round.current_artist_id.clone().unwrap());
        play_guesses_then_vote_truth(&mut room, 300);
        room.handle_start_or_advance(500).unwrap();
    }

    assert_eq!(revealed_artists.len(), 3);
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 2);
}

#[test]
fn reconnect_keeps_player_slot() {
    let mut room = room_with_players();
    room.mark_disconnected("p1", 10);
    assert!(!room.players.get("p1").unwrap().connected);
    room.upsert_player("p1".to_string(), "Ada Again".to_string(), 20)
        .unwrap();
    let player = room.players.get("p1").unwrap();
    assert!(player.connected);
    assert_eq!(player.name, "Ada");
    assert_eq!(room.players.len(), 3);
}

#[test]
fn reconnect_during_drawing_then_submit_advances() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let token = room.turn_token;
    room.submit_drawing("p1", token, drawing(), 200).unwrap();
    room.mark_disconnected("p2", 201);
    room.upsert_player("p2".to_string(), "Grace".to_string(), 202)
        .unwrap();
    assert!(!room.players.get("p2").unwrap().spectator);
    room.submit_drawing("p2", token, drawing(), 203).unwrap();
    room.submit_drawing("p3", token, drawing(), 204).unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.round.drawings.len(), 3);
}

#[test]
fn round_transition_keeps_a_disconnected_players_slot_and_score() {
    let mut room = room_with_players();
    room.settings.rounds = 2;
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);

    for reveal in 0..3 {
        play_guesses_then_vote_truth(&mut room, 300 + reveal * 100);
        if reveal == 2 {
            room.mark_disconnected("p3", 550);
        }
        room.handle_start_or_advance(600 + reveal * 100).unwrap();
    }

    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 2);
    let retained = room.players.get("p3").expect("player slot retained");
    assert!(!retained.connected);
    assert!(retained.spectator);
    assert!(retained.score > 0);
    let retained_score = retained.score;
    assert!(!room.round.prompts.contains_key("p3"));
    assert!(!room.round.order.contains(&"p3".to_string()));

    room.upsert_player("p3".to_string(), "Linus Back".to_string(), 900)
        .unwrap();
    assert_eq!(room.players.get("p3").unwrap().score, retained_score);
    assert!(room.players.get("p3").unwrap().spectator);
    assert_eq!(
        room.submit_drawing("p3", room.turn_token, drawing(), 901)
            .unwrap_err()
            .code,
        "spectator"
    );

    let round_token = room.turn_token;
    room.submit_drawing("p1", round_token, drawing(), 902)
        .unwrap();
    room.submit_drawing("p2", round_token, drawing(), 903)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(
        room.submit_guess("p3", room.turn_token, "late fake".to_string(), 904)
            .unwrap_err()
            .code,
        "spectator"
    );

    play_guesses_then_vote_truth(&mut room, 905);
    assert!(room.round.result.as_ref().unwrap().perfect_truth);
    assert_eq!(
        room.final_scores()
            .iter()
            .find(|score| score.player_id == "p3")
            .map(|score| score.score),
        Some(retained_score)
    );
}

#[test]
fn party_start_rejects_one_connected_player() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);
    let error = room.handle_start_or_advance(100).unwrap_err();
    assert_eq!(error.code, "not_enough_players");
    assert_eq!(room.phase, GamePhase::Lobby);
}

#[test]
fn party_start_rejects_two_connected_players() {
    let mut room = room_with_players();
    room.mark_disconnected("p3", 11);
    let error = room.handle_start_or_advance(100).unwrap_err();
    assert_eq!(error.code, "not_enough_players");
    assert_eq!(room.phase, GamePhase::Lobby);
}

#[test]
fn practice_accepts_exactly_one_player_and_scores_nothing() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);
    room.handle_start_practice(100).unwrap();
    assert_eq!(room.game_mode, GameMode::Practice);
    assert_eq!(room.snapshot(100).total_rounds, 1);
    let event = room
        .submit_drawing("p1", room.turn_token, drawing(), 200)
        .unwrap();
    assert_eq!(event, EngineEvent::PhaseChanged);
    assert_eq!(room.phase, GamePhase::Results);
    assert_eq!(room.round.guesses.len(), 0);
    assert_eq!(room.round.votes.len(), 0);
    let result = room.round.result.as_ref().unwrap();
    assert_eq!(result.artist_id, "p1");
    assert_eq!(result.breakdown.len(), 1);
    assert_eq!(result.correct_voter_names.len(), 0);
    assert!(result.score_events.is_empty());
    assert!(result.score_deltas.iter().all(|delta| delta.delta == 0));

    room.handle_start_or_advance(300).unwrap();
    assert_eq!(room.phase, GamePhase::FinalScores);
    room.handle_start_practice(400).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    assert_eq!(room.game_mode, GameMode::Practice);
}

#[test]
fn practice_rejects_more_than_one_connected_phone() {
    let mut room = room_with_players();
    room.mark_disconnected("p3", 10);
    let error = room.handle_start_practice(100).unwrap_err();
    assert_eq!(error.code, "practice_requires_one_player");
    assert_eq!(room.phase, GamePhase::Lobby);
}

#[test]
fn blank_practice_retry_can_be_abandoned_for_a_fresh_party_game() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);
    room.handle_start_practice(100).unwrap();
    let practice_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    room.players.get_mut("p1").unwrap().score = 123;

    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    room.upsert_player("p2".to_string(), "Grace".to_string(), 200)
        .unwrap();
    room.upsert_player("p3".to_string(), "Linus".to_string(), 201)
        .unwrap();
    room.handle_start_or_advance(300).unwrap();

    let party_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.game_mode, GameMode::Party);
    assert_eq!(room.current_round, 1);
    assert_eq!(party_prompts.len(), 3);
    assert!(practice_prompts.is_disjoint(&party_prompts));
    assert_eq!(room.used_prompt_keys.len(), 4);
    assert!(room.pending_drawing_retry.is_none());
    assert!(room.players.values().all(|player| player.score == 0));
}

#[test]
fn blank_party_retry_can_be_abandoned_for_a_fresh_practice_game() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let party_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    room.players.get_mut("p1").unwrap().score = 123;

    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    room.mark_disconnected("p2", 200);
    room.mark_disconnected("p3", 201);
    room.handle_start_practice(300).unwrap();

    let practice_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.game_mode, GameMode::Practice);
    assert_eq!(room.current_round, 1);
    assert_eq!(practice_prompts.len(), 1);
    assert!(party_prompts.is_disjoint(&practice_prompts));
    assert_eq!(room.used_prompt_keys.len(), 4);
    assert!(room.pending_drawing_retry.is_none());
    assert_eq!(room.players.len(), 1);
    assert_eq!(room.players.get("p1").unwrap().score, 0);
}

#[test]
fn late_joiner_remains_a_spectator_during_practice() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);
    room.handle_start_practice(100).unwrap();

    room.upsert_player("p4".to_string(), "Spectator".to_string(), 150)
        .unwrap();

    assert!(room.players.get("p4").unwrap().spectator);
    assert!(!room.round.prompts.contains_key("p4"));
}

#[test]
fn start_prunes_disconnected_lobby_players() {
    let mut room = room_with_players();
    room.upsert_player("p4".to_string(), "Margaret".to_string(), 2)
        .unwrap();
    room.mark_disconnected("p4", 10);
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.players.len(), 3);
    assert!(!room.players.contains_key("p4"));
    assert_eq!(room.round.order.len(), 3);
}

#[test]
fn drawing_timeout_without_submissions_suspends_the_round_in_lobby() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let event = room
        .advance_if_expired(100 + room.settings.draw_seconds * 1000)
        .unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Lobby);
    assert_eq!(room.current_round, 1);
    assert!(room.deadline_ms.is_none());
    assert!(room.pending_drawing_retry.is_some());
}

#[test]
fn drawing_timeout_with_partial_submissions_enters_guessing() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let token = room.turn_token;
    room.submit_drawing("p1", token, drawing(), 200).unwrap();
    room.submit_drawing("p2", token, drawing(), 201).unwrap();
    let deadline = room.deadline_ms.unwrap();
    room.advance_if_expired(deadline).unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.round.drawings.len(), 2);
    let artist = room.round.current_artist_id.clone().unwrap();
    assert!(room.round.drawings.contains_key(&artist));
    assert!(!room.round.drawings.contains_key("p3"));
}

#[test]
fn guessing_timeout_without_guesses_skips_to_results() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let event = room
        .advance_if_expired(200 + room.settings.guess_seconds * 1000)
        .unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Results);
    assert!(room.round.result.is_some());
}

#[test]
fn all_eligible_guessers_disconnect_advances_via_ready() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    for voter in non_artist_ids(&room) {
        room.mark_disconnected(&voter, 250);
    }
    let event = room.advance_if_ready(251).unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Results);
}

#[test]
fn room_expires_only_after_everyone_disconnects_and_ttl_passes() {
    let mut room = room_with_players();
    assert!(!room.is_expired(ROOM_TTL_MS + 1));
    room.mark_disconnected("display", 10);
    room.mark_disconnected("p1", 11);
    room.mark_disconnected("p2", 12);
    room.mark_disconnected("p3", 13);
    assert!(!room.is_expired(13 + ROOM_TTL_MS));
    assert!(room.is_expired(14 + ROOM_TTL_MS));
}

#[test]
fn display_disconnect_alone_does_not_expire_room() {
    let mut room = room_with_players();
    room.mark_disconnected("display", 10);
    assert!(!room.is_expired(10 + ROOM_TTL_MS + 1));
    room.mark_disconnected("p1", 11);
    room.mark_disconnected("p2", 12);
    room.mark_disconnected("p3", 13);
    assert!(room.is_expired(14 + ROOM_TTL_MS));
}

#[test]
fn upsert_rejects_ninth_seat_but_allows_existing_reconnect() {
    let mut room = Room::new(
        "FULL".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    for i in 0..MAX_PLAYERS {
        room.upsert_player(format!("p{i}"), format!("Player{i}"), i as u64)
            .unwrap();
    }
    assert!(!room.players.get("p0").unwrap().spectator);
    assert_eq!(
        room.upsert_player("extra".to_string(), "Nope".to_string(), 100)
            .unwrap_err()
            .code,
        "room_full"
    );
    room.mark_disconnected("p0", 101);
    room.upsert_player("p0".to_string(), "Back".to_string(), 102)
        .unwrap();
    assert!(room.players.get("p0").unwrap().connected);
    assert_eq!(room.players.get("p0").unwrap().name, "Player0");
    assert_eq!(room.players.len(), MAX_PLAYERS);
}

#[test]
fn late_join_as_spectator_allowed() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("spec".to_string(), "Spectator".to_string(), 150)
        .unwrap();
    let spectator = room.players.get("spec").unwrap();
    assert!(spectator.spectator);
    assert!(spectator.connected);
    assert!(!room.round.prompts.contains_key("spec"));
    assert!(room
        .snapshot(160)
        .players
        .iter()
        .any(|player| player.id == "spec" && player.spectator));
}

#[test]
fn spectator_cannot_submit() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("spec".to_string(), "Spectator".to_string(), 150)
        .unwrap();
    let token = room.turn_token;
    assert_eq!(
        room.submit_drawing("spec", token, drawing(), 160)
            .unwrap_err()
            .code,
        "spectator"
    );
    submit_all_drawings(&mut room, 200);
    let token = room.turn_token;
    assert_eq!(
        room.submit_guess("spec", token, "nope".to_string(), 210)
            .unwrap_err()
            .code,
        "spectator"
    );
    let voters = non_artist_ids(&room);
    room.submit_guess(&voters[0], token, "fake one".to_string(), 220)
        .unwrap();
    room.submit_guess(&voters[1], token, "fake two".to_string(), 221)
        .unwrap();
    assert_eq!(
        room.submit_vote("spec", room.turn_token, truth_option_id(&room), 230)
            .unwrap_err()
            .code,
        "spectator"
    );
}

#[test]
fn connected_progress_ignores_spectators() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("spec".to_string(), "Spectator".to_string(), 150)
        .unwrap();
    submit_all_drawings(&mut room, 200);
    let voters = non_artist_ids(&room);
    assert_eq!(voters.len(), 2);
    play_guesses_then_vote_truth(&mut room, 300);
    assert!(!room
        .snapshot(500)
        .final_scores
        .iter()
        .any(|entry| entry.player_id == "spec"));
}

#[test]
fn late_join_during_drawing_is_spectator_until_next_round() {
    let mut room = room_with_players();
    room.settings.rounds = 2;
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("p4".to_string(), "Spect".to_string(), 200)
        .unwrap();
    assert!(room.players.get("p4").unwrap().spectator);
    assert!(!room.round.prompts.contains_key("p4"));
    assert!(!room.round.order.contains(&"p4".to_string()));

    submit_all_drawings(&mut room, 300);
    assert_eq!(room.phase, GamePhase::Guessing);
    assert!(room
        .submit_guess("p4", room.turn_token, "nope".to_string(), 400)
        .is_err());

    for _ in 0..3 {
        play_guesses_then_vote_truth(&mut room, 500);
        room.handle_start_or_advance(700).unwrap();
    }

    assert_eq!(room.phase, GamePhase::Drawing);
    assert!(!room.players.get("p4").unwrap().spectator);
    assert!(room.round.prompts.contains_key("p4"));
    assert!(room.round.order.contains(&"p4".to_string()));
}

#[test]
fn late_join_during_an_empty_round_retry_waits_as_a_spectator() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let assigned_prompts = room.round.prompts.clone();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    assert_eq!(room.phase, GamePhase::Lobby);

    room.upsert_player("p4".to_string(), "Spect".to_string(), 200)
        .unwrap();
    assert!(room.players.get("p4").unwrap().spectator);

    room.handle_start_or_advance(300).unwrap();
    assert_eq!(room.round.prompts, assigned_prompts);
    assert!(!room.round.prompts.contains_key("p4"));
    assert!(!room.round.order.contains(&"p4".to_string()));
}

#[test]
fn connected_replacement_can_resume_when_every_assigned_player_left() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let assigned_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    let used_prompts = room.used_prompt_keys.clone();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();

    for player_id in ["p1", "p2", "p3"] {
        room.mark_disconnected(player_id, 200);
    }
    room.upsert_player("p4".to_string(), "New Player".to_string(), 201)
        .unwrap();
    assert!(room.players.get("p4").unwrap().spectator);

    room.handle_start_or_advance(300).unwrap();

    assert_eq!(room.phase, GamePhase::Drawing);
    assert!(!room.players.get("p4").unwrap().spectator);
    assert!(assigned_prompts.contains(room.round.prompts.get("p4").unwrap()));
    assert_eq!(room.used_prompt_keys, used_prompts);
    assert_eq!(room.round.prompts.len(), 3);

    room.submit_drawing("p4", room.turn_token, drawing(), 301)
        .unwrap();
    assert_ne!(room.phase, GamePhase::Drawing);
}

#[test]
fn start_drawing_round_failure_does_not_promote_or_prune() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.upsert_player("spec".to_string(), "Spec".to_string(), 150)
        .unwrap();
    assert!(room.players.get("spec").unwrap().spectator);
    assert_eq!(room.players.len(), 4);

    for player_id in ["p1", "p2", "p3", "spec"] {
        room.mark_disconnected(player_id, 200);
    }
    room.phase = GamePhase::FinalScores;
    room.current_round = 1;

    let err = room.handle_start_or_advance(300).unwrap_err();
    assert_eq!(err.code, "not_enough_players");
    assert_eq!(room.phase, GamePhase::FinalScores);
    assert_eq!(room.players.len(), 4);
    assert!(room.players.get("spec").unwrap().spectator);
    assert!(!room.players.get("p1").unwrap().connected);
}
