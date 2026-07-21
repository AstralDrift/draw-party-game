use super::super::*;
use super::helpers::*;
use std::collections::BTreeMap;

#[test]
fn advances_through_guess_vote_and_scores() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let prompts = room.round.prompts.clone();
    submit_all_drawings(&mut room, 200);
    assert_eq!(room.phase, GamePhase::Guessing);

    let artist = room.round.current_artist_id.clone().unwrap();
    let voters = non_artist_ids(&room);
    play_guesses_then_vote_truth(&mut room, 300);

    let result = room.round.result.as_ref().unwrap();
    assert_eq!(
        result.correct_answer,
        prompts.get(&artist).unwrap().to_string()
    );
    let deltas = deltas_map(&room);
    assert_eq!(deltas.get(&artist), Some(&200));
    assert_eq!(deltas.get(&voters[0]), Some(&225));
    assert_eq!(deltas.get(&voters[1]), Some(&225));
    assert!(result.perfect_truth);
    assert!(!result.nobody_found_it);
    assert_eq!(room.players.get(&artist).unwrap().score, 200);
    assert!(room.deadline_ms.is_some());
}

#[test]
fn nobody_found_it_awards_artist_bonus() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let token = room.turn_token;
    room.submit_vote(
        &voters[0],
        token,
        fake_option_id_for(&room, &voters[1]),
        400,
    )
    .unwrap();
    room.submit_vote(
        &voters[1],
        token,
        fake_option_id_for(&room, &voters[0]),
        401,
    )
    .unwrap();

    let result = room.round.result.as_ref().unwrap();
    assert!(result.nobody_found_it);
    assert!(!result.perfect_truth);
    let deltas = deltas_map(&room);
    assert_eq!(deltas.get(&artist), Some(&50));
    assert_eq!(deltas.get(&voters[0]), Some(&50));
    assert_eq!(deltas.get(&voters[1]), Some(&50));
}

#[test]
fn mixed_votes_score_correct_and_fake_author_exactly() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let token = room.turn_token;
    room.submit_vote(
        &voters[0],
        token,
        fake_option_id_for(&room, &voters[1]),
        400,
    )
    .unwrap();
    room.submit_vote(&voters[1], token, truth_option_id(&room), 401)
        .unwrap();

    let result = room.round.result.as_ref().unwrap();
    assert!(!result.perfect_truth);
    assert!(!result.nobody_found_it);
    let deltas = deltas_map(&room);
    assert_eq!(deltas.get(&voters[1]), Some(&250));
    assert_eq!(deltas.get(&artist), Some(&100));
    assert_eq!(deltas.get(&voters[0]), Some(&0));
}

#[test]
fn perfect_truth_false_when_disconnected_eligible_voter_misses() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "fake one".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], token, "fake two".to_string(), 301)
        .unwrap();
    room.mark_disconnected(&voters[1], 350);
    room.submit_vote(&voters[0], room.turn_token, truth_option_id(&room), 400)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Results);
    assert!(!room.round.result.as_ref().unwrap().perfect_truth);
    assert_eq!(deltas_map(&room).get(&voters[0]), Some(&200));
}

#[test]
fn vote_timeout_with_zero_votes_awards_nobody_found() {
    let mut room = room_with_players();
    reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let deadline = room.deadline_ms.unwrap();
    room.advance_if_expired(deadline).unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    assert!(result.nobody_found_it);
    assert!(!result.perfect_truth);
    assert_eq!(deltas_map(&room).get(&artist), Some(&50));
}

#[test]
fn guess_matching_truth_is_rejected_without_consuming_submission() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let truth = room.round.prompts.get(&artist).unwrap().clone();
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    let error = room
        .submit_guess(
            &voters[0],
            token,
            format!("  {}  ", truth.to_uppercase()),
            300,
        )
        .unwrap_err();

    assert_eq!(error.code, "guess_conflict");
    assert_eq!(
        error.message,
        "That title can't be used. Try a different one."
    );
    assert!(!room.round.guesses.contains_key(&voters[0]));
    assert_eq!(room.phase, GamePhase::Guessing);
}

#[test]
fn duplicate_normalized_fake_is_rejected_without_consuming_submission() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "  Same Fake  ".to_string(), 300)
        .unwrap();
    let error = room
        .submit_guess(&voters[1], token, "same   fake".to_string(), 301)
        .unwrap_err();

    assert_eq!(error.code, "guess_conflict");
    assert_eq!(
        error.message,
        "That title can't be used. Try a different one."
    );
    assert!(!room.round.guesses.contains_key(&voters[1]));
    assert_eq!(room.phase, GamePhase::Guessing);
}

#[test]
fn canonically_equivalent_unicode_guess_is_rejected_as_the_truth() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    room.round
        .prompts
        .insert(artist, "piñata hosting a reunion".to_string());
    let voter = non_artist_ids(&room).remove(0);

    let error = room
        .submit_guess(
            &voter,
            room.turn_token,
            "pin\u{0303}ata hosting a reunion".to_string(),
            300,
        )
        .unwrap_err();

    assert_eq!(error.code, "guess_conflict");
    assert!(!room.round.guesses.contains_key(&voter));
}

#[test]
fn rejected_collision_can_be_replaced_and_each_accepted_fake_keeps_its_author() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let token = room.turn_token;

    room.submit_guess(&voters[0], token, "First Fake".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], token, " first fake ".to_string(), 301)
        .unwrap_err();
    room.submit_guess(&voters[1], token, "Replacement Fake".to_string(), 302)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Voting);
    for (player_id, expected_text) in [
        (voters[0].as_str(), "First Fake"),
        (voters[1].as_str(), "Replacement Fake"),
    ] {
        let option = room
            .round
            .voting_options
            .iter()
            .find(|option| option.author_player_id.as_deref() == Some(player_id))
            .expect("accepted fake is present in voting");
        assert_eq!(option.text, expected_text);
        assert_eq!(
            option.author_name.as_deref(),
            room.players
                .get(player_id)
                .map(|player| player.name.as_str())
        );
    }
}

#[test]
fn reaches_final_scores_then_restart_resets_scores() {
    let mut room = room_with_players();
    let mut settings = custom_settings();
    settings.rounds = 1;
    room.update_settings(settings, 50).unwrap();
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);

    for _ in 0..3 {
        play_guesses_then_vote_truth(&mut room, 300);
        room.handle_start_or_advance(500).unwrap();
    }

    assert_eq!(room.phase, GamePhase::FinalScores);
    assert!(room.players.values().any(|player| player.score > 0));
    let prior_scores: BTreeMap<_, _> = room
        .players
        .iter()
        .map(|(id, player)| (id.clone(), player.score))
        .collect();

    room.handle_start_or_advance(600).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    for (id, prior) in prior_scores {
        assert_ne!(prior, 0);
        assert_eq!(room.players.get(&id).unwrap().score, 0);
    }
}
