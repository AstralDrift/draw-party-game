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
    assert_eq!(deltas.get(&artist), Some(&250));
    assert_eq!(deltas.get(&voters[0]), Some(&200));
    assert_eq!(deltas.get(&voters[1]), Some(&200));
    assert!(result.perfect_truth);
    assert!(!result.nobody_found_it);
    assert_eq!(room.players.get(&artist).unwrap().score, 250);
    assert_eq!(
        result
            .score_events
            .iter()
            .filter(|event| event.kind == ScoreEventKind::FoundTruth)
            .count(),
        2
    );
    assert_eq!(
        result
            .score_events
            .iter()
            .filter(|event| event.kind == ScoreEventKind::ArtistClarity)
            .count(),
        2
    );
    assert_eq!(
        result
            .score_events
            .iter()
            .filter(|event| event.kind == ScoreEventKind::PerfectTruth)
            .count(),
        2
    );
    assert!(result
        .score_events
        .iter()
        .all(|event| event.related_player_id.is_some() && event.related_player_name.is_some()));
    for delta in &result.score_deltas {
        let event_total: i32 = result
            .score_events
            .iter()
            .filter(|event| event.player_id == delta.player_id)
            .map(|event| event.points)
            .sum();
        assert_eq!(event_total, delta.delta);
        assert_eq!(
            delta.score_after,
            room.players.get(&delta.player_id).unwrap().score
        );
    }
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
    let nobody_event = result
        .score_events
        .iter()
        .find(|event| event.kind == ScoreEventKind::NobodyFoundIt)
        .unwrap();
    assert_eq!(nobody_event.player_id, artist);
    assert_eq!(nobody_event.points, 50);
    assert!(nobody_event.related_player_id.is_none());
    assert!(nobody_event.related_player_name.is_none());
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
fn disconnected_non_voter_is_excluded_from_perfect_truth_cohort() {
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
    assert!(room.round.result.as_ref().unwrap().perfect_truth);
    assert_eq!(deltas_map(&room).get(&voters[0]), Some(&200));
    let artist = room.round.current_artist_id.as_ref().unwrap();
    assert_eq!(deltas_map(&room).get(artist), Some(&125));
}

#[test]
fn voter_who_disconnects_after_voting_remains_in_perfect_truth_cohort() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let token = room.turn_token;
    let truth = truth_option_id(&room);

    room.submit_vote(&voters[1], token, truth.clone(), 400)
        .unwrap();
    room.mark_disconnected(&voters[1], 401);
    room.submit_vote(&voters[0], token, truth, 402).unwrap();

    let result = room.round.result.as_ref().unwrap();
    assert!(result.perfect_truth);
    assert_eq!(deltas_map(&room).get(&artist), Some(&250));
    assert_eq!(deltas_map(&room).get(&voters[0]), Some(&200));
    assert_eq!(deltas_map(&room).get(&voters[1]), Some(&200));
}

#[test]
fn vote_timeout_with_zero_votes_awards_no_nobody_found_bonus() {
    let mut room = room_with_players();
    reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let deadline = room.deadline_ms.unwrap();
    room.advance_if_expired(deadline).unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    assert!(!result.nobody_found_it);
    assert!(!result.perfect_truth);
    assert_eq!(deltas_map(&room).get(&artist), Some(&0));
    assert!(result.score_events.is_empty());
}

#[test]
fn guess_matching_truth_is_accepted_and_locks_a_scored_correct_vote() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let truth = room.round.prompts.get(&artist).unwrap().clone();
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    room.submit_guess(
        &voters[0],
        token,
        format!("  {}  ", truth.to_uppercase()),
        300,
    )
    .unwrap();
    room.submit_guess(&voters[1], token, "plausible fake".to_string(), 301)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Voting);
    let truth_option_id = truth_option_id(&room);
    assert_eq!(
        room.round.votes.get(&voters[0]),
        Some(&truth_option_id),
        "the truth-matching guess should become a locked correct vote"
    );
    assert_eq!(room.round.voting_options.len(), 2);
    assert_eq!(
        room.round
            .voting_options
            .iter()
            .filter(|option| normalize_text(&option.text) == normalize_text(&truth))
            .count(),
        1,
        "the truth-matching guess must not become a fake option"
    );

    room.submit_vote(&voters[1], room.turn_token, truth_option_id, 400)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    assert_eq!(deltas_map(&room).get(&voters[0]), Some(&200));
    assert!(result
        .correct_voter_names
        .contains(&room.players.get(&voters[0]).unwrap().name));
}

#[test]
fn sole_truth_option_auto_finishes_without_scoring_an_unsubmitted_guesser() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let truth = room.round.prompts.get(&artist).unwrap().clone();
    let voters = non_artist_ids(&room);

    room.submit_guess(&voters[0], room.turn_token, truth, 300)
        .unwrap();
    let deadline = room.deadline_ms.expect("guessing deadline");
    room.advance_if_expired(deadline).unwrap();

    assert_eq!(room.phase, GamePhase::Results);
    let truth_option = truth_option_id(&room);
    assert_eq!(room.round.votes.get(&voters[0]), Some(&truth_option));
    assert_eq!(room.round.votes.get(&voters[1]), None);
    assert_eq!(deltas_map(&room).get(&voters[0]), Some(&200));
    assert_eq!(deltas_map(&room).get(&voters[1]), Some(&0));
    let result = room.round.result.as_ref().unwrap();
    assert_eq!(result.correct_voter_names.len(), 1);
    assert!(!result.perfect_truth);
    assert_eq!(deltas_map(&room).get(&artist), Some(&100));
}

#[test]
fn duplicate_fakes_merge_block_all_coauthors_and_split_each_fooled_award() {
    let mut room = room_with_players();
    room.upsert_player("p4".to_string(), "Margaret".to_string(), 2)
        .unwrap();
    room.upsert_player("p5".to_string(), "Katherine".to_string(), 3)
        .unwrap();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    let coauthors = voters[..3].to_vec();
    let fooled_voter = voters[3].clone();
    let token = room.turn_token;
    assert_eq!(
        room.submit_guess(&coauthors[0], token, "  Same Fake  ".to_string(), 300)
            .unwrap(),
        EngineEvent::Snapshot
    );
    assert_eq!(
        room.submit_guess(&coauthors[1], token, "same   fake".to_string(), 301)
            .unwrap(),
        EngineEvent::Snapshot
    );
    room.submit_guess(&coauthors[2], token, "SAME FAKE".to_string(), 302)
        .unwrap();
    room.submit_guess(&fooled_voter, token, "other fake".to_string(), 303)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Voting);
    let merged_option = room
        .round
        .voting_options
        .iter()
        .find(|option| normalize_text(&option.text) == "same fake")
        .cloned()
        .expect("one merged duplicate option");
    assert_eq!(
        room.round
            .voting_options
            .iter()
            .filter(|option| normalize_text(&option.text) == "same fake")
            .count(),
        1
    );
    let vote_token = room.turn_token;
    for coauthor in &coauthors {
        assert_eq!(
            room.submit_vote(coauthor, vote_token, merged_option.id.clone(), 400)
                .unwrap_err()
                .code,
            "own_guess"
        );
    }

    let truth = truth_option_id(&room);
    for (index, coauthor) in coauthors.iter().enumerate() {
        room.submit_vote(coauthor, vote_token, truth.clone(), 410 + index as u64)
            .unwrap();
    }
    room.submit_vote(&fooled_voter, vote_token, merged_option.id, 420)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    let merged_breakdown = result
        .breakdown
        .iter()
        .find(|option| normalize_text(&option.option_text) == "same fake")
        .unwrap();
    let author_names = merged_breakdown.author_name.as_deref().unwrap_or_default();
    for coauthor in &coauthors {
        assert!(author_names.contains(&room.players.get(coauthor).unwrap().name));
    }

    let split_events: BTreeMap<String, i32> = result
        .score_events
        .iter()
        .filter(|event| {
            event.kind == ScoreEventKind::FooledPlayer
                && event.related_player_id.as_deref() == Some(fooled_voter.as_str())
        })
        .map(|event| (event.player_id.clone(), event.points))
        .collect();
    assert_eq!(split_events.values().sum::<i32>(), 50);
    assert_eq!(split_events.len(), 3);
    let mut sorted_coauthors = coauthors.clone();
    sorted_coauthors.sort();
    assert_eq!(split_events.get(&sorted_coauthors[0]), Some(&17));
    assert_eq!(split_events.get(&sorted_coauthors[1]), Some(&17));
    assert_eq!(split_events.get(&sorted_coauthors[2]), Some(&16));
}

#[test]
fn canonically_equivalent_unicode_truth_guess_is_auto_voted() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    room.round
        .prompts
        .insert(artist, "piñata hosting a reunion".to_string());
    let voters = non_artist_ids(&room);
    let token = room.turn_token;

    room.submit_guess(
        &voters[0],
        token,
        "pin\u{0303}ata hosting a reunion".to_string(),
        300,
    )
    .unwrap();
    room.submit_guess(&voters[1], token, "family party".to_string(), 301)
        .unwrap();

    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(
        room.round.votes.get(&voters[0]),
        Some(&truth_option_id(&room))
    );
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
        continue_after_show(&mut room);
    }

    assert_eq!(room.phase, GamePhase::FinalScores);
    assert!(room.players.values().any(|player| player.score > 0));
    let replay_unlock_ms = room.deadline_ms.expect("final scores unlock deadline");
    assert_eq!(
        replay_unlock_ms,
        room.round.presentation.as_ref().unwrap().continue_at_ms + 3_000
    );
    let prior_scores: BTreeMap<_, _> = room
        .players
        .iter()
        .map(|(id, player)| (id.clone(), player.score))
        .collect();

    assert_eq!(
        room.handle_start_or_advance(replay_unlock_ms - 1)
            .unwrap_err()
            .code,
        "final_scores_locked"
    );
    assert_eq!(room.phase, GamePhase::FinalScores);
    assert_eq!(
        room.players
            .iter()
            .map(|(id, player)| (id.clone(), player.score))
            .collect::<BTreeMap<_, _>>(),
        prior_scores
    );

    room.handle_start_or_advance(replay_unlock_ms).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    for (id, prior) in prior_scores {
        assert_ne!(prior, 0);
        assert_eq!(room.players.get(&id).unwrap().score, 0);
    }
}
