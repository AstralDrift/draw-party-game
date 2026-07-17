use super::*;
use crate::protocol::{DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID};

fn drawing() -> DrawingDoc {
    DrawingDoc {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        strokes: vec![Stroke {
            color: "#111111".to_string(),
            size: 6,
            points: vec![Point { x: 1, y: 1 }, Point { x: 30, y: 35 }],
        }],
    }
}

fn empty_drawing() -> DrawingDoc {
    DrawingDoc {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        strokes: vec![],
    }
}

fn room_with_players() -> Room {
    let mut room = Room::new(
        "ABCD".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    room.upsert_player("p2".to_string(), "Grace".to_string(), 1)
        .unwrap();
    room.upsert_player("p3".to_string(), "Linus".to_string(), 1)
        .unwrap();
    room
}

fn custom_settings() -> RoomSettings {
    RoomSettings {
        rounds: 2,
        draw_seconds: 30,
        guess_seconds: 20,
        vote_seconds: 15,
        results_seconds: 8,
        prompt_pack_id: DEFAULT_PROMPT_PACK_ID.to_string(),
    }
}

fn submit_all_drawings(room: &mut Room, now_ms: u64) {
    let token = room.turn_token;
    let player_ids: Vec<String> = room
        .players
        .values()
        .filter(|player| !player.spectator)
        .map(|player| player.id.clone())
        .collect();
    for player_id in player_ids {
        room.submit_drawing(&player_id, token, drawing(), now_ms)
            .unwrap();
    }
}

fn non_artist_ids(room: &Room) -> Vec<String> {
    let artist = room.round.current_artist_id.as_deref();
    room.players
        .values()
        .filter(|player| !player.spectator && artist != Some(player.id.as_str()))
        .map(|player| player.id.clone())
        .collect()
}

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
fn snapshot_includes_settings_and_server_clock() {
    let room = room_with_players();
    let snapshot = room.snapshot(12345);
    assert_eq!(snapshot.settings, RoomSettings::default());
    assert_eq!(snapshot.server_now_ms, 12345);
    assert_eq!(snapshot.total_rounds, RoomSettings::default().rounds);
}

#[test]
fn updates_settings_in_lobby_and_uses_custom_deadlines() {
    let mut room = room_with_players();
    room.update_settings(custom_settings(), 50).unwrap();
    assert_eq!(room.settings, custom_settings());

    room.handle_start_or_advance(100).unwrap();
    assert_eq!(room.deadline_ms, Some(100 + 30_000));
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.deadline_ms, Some(200 + 20_000));

    let guess_token = room.turn_token;
    let artist = room.round.current_artist_id.clone().unwrap();
    let voters: Vec<String> = room
        .players
        .keys()
        .filter(|id| *id != &artist)
        .cloned()
        .collect();
    room.submit_guess(&voters[0], guess_token, "fake one".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "fake two".to_string(), 300)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(room.deadline_ms, Some(300 + 15_000));
}

#[test]
fn rejects_invalid_room_settings() {
    let mut room = room_with_players();
    let mut settings = custom_settings();
    settings.rounds = 0;
    assert_eq!(
        room.update_settings(settings, 50).unwrap_err().code,
        "invalid_settings"
    );

    let mut settings = custom_settings();
    settings.prompt_pack_id = "unknown".to_string();
    assert_eq!(
        room.update_settings(settings, 51).unwrap_err().code,
        "invalid_prompt_pack"
    );

    // Bound matrix: each timer/rounds field rejects below-min and above-max.
    let mut below = custom_settings();
    below.rounds = 0;
    assert_eq!(
        room.update_settings(below, 52).unwrap_err().code,
        "invalid_settings"
    );
    let mut above = custom_settings();
    above.rounds = MAX_ROUNDS + 1;
    assert_eq!(
        room.update_settings(above, 52).unwrap_err().code,
        "invalid_settings"
    );
    for (field, value) in [
        ("draw_low", MIN_DRAW_SECONDS - 1),
        ("draw_high", MAX_DRAW_SECONDS + 1),
        ("guess_low", MIN_GUESS_SECONDS - 1),
        ("guess_high", MAX_GUESS_SECONDS + 1),
        ("vote_low", MIN_VOTE_SECONDS - 1),
        ("vote_high", MAX_VOTE_SECONDS + 1),
        ("results_low", MIN_RESULTS_SECONDS - 1),
        ("results_high", MAX_RESULTS_SECONDS + 1),
    ] {
        let mut settings = custom_settings();
        match field {
            "draw_low" | "draw_high" => settings.draw_seconds = value,
            "guess_low" | "guess_high" => settings.guess_seconds = value,
            "vote_low" | "vote_high" => settings.vote_seconds = value,
            "results_low" | "results_high" => settings.results_seconds = value,
            _ => unreachable!(),
        }
        assert_eq!(
            room.update_settings(settings, 52).unwrap_err().code,
            "invalid_settings",
            "expected reject for {field}={value}"
        );
    }

    let mut edge_min = custom_settings();
    edge_min.rounds = MIN_ROUNDS;
    edge_min.draw_seconds = MIN_DRAW_SECONDS;
    edge_min.guess_seconds = MIN_GUESS_SECONDS;
    edge_min.vote_seconds = MIN_VOTE_SECONDS;
    edge_min.results_seconds = MIN_RESULTS_SECONDS;
    room.update_settings(edge_min.clone(), 53).unwrap();
    assert_eq!(room.settings, edge_min);

    let mut edge_max = custom_settings();
    edge_max.rounds = MAX_ROUNDS;
    edge_max.draw_seconds = MAX_DRAW_SECONDS;
    edge_max.guess_seconds = MAX_GUESS_SECONDS;
    edge_max.vote_seconds = MAX_VOTE_SECONDS;
    edge_max.results_seconds = MAX_RESULTS_SECONDS;
    edge_max.prompt_pack_id = format!("  {PARTY_CHAOS_PROMPT_PACK_ID}  ");
    room.update_settings(edge_max, 54).unwrap();
    assert_eq!(room.settings.rounds, MAX_ROUNDS);
    assert_eq!(room.settings.prompt_pack_id, PARTY_CHAOS_PROMPT_PACK_ID);
}

#[test]
fn rejects_settings_update_after_lobby() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let err = room.update_settings(custom_settings(), 101).unwrap_err();
    assert_eq!(err.code, "invalid_phase");
    assert_eq!(room.settings, RoomSettings::default());
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
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
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
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);
    assert_eq!(room.phase, GamePhase::Guessing);

    let voters = non_artist_ids(&room);
    room.mark_disconnected(&voters[1], 250);
    let token = room.turn_token;
    let event = room
        .submit_guess(&voters[0], token, "only connected fake".to_string(), 300)
        .unwrap();

    assert_eq!(event, EngineEvent::PhaseChanged);
    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(room.round.guesses.len(), 1);
}

#[test]
fn voting_counts_only_connected_non_artists() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    submit_all_drawings(&mut room, 200);
    let voters = non_artist_ids(&room);
    let guess_token = room.turn_token;
    room.submit_guess(&voters[0], guess_token, "first fake".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "second fake".to_string(), 301)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);

    room.mark_disconnected(&voters[1], 350);
    let vote_token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    let event = room
        .submit_vote(&voters[0], vote_token, truth, 400)
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
    let drawing_err = room
        .submit_drawing("p3", room.turn_token, drawing(), 151)
        .unwrap_err();
    assert_eq!(drawing_err.code, "not_connected");

    room.upsert_player("p3".to_string(), "Linus".to_string(), 160)
        .unwrap();
    submit_all_drawings(&mut room, 200);
    let voters = non_artist_ids(&room);
    room.mark_disconnected(&voters[0], 250);
    let guess_err = room
        .submit_guess(&voters[0], room.turn_token, "late fake".to_string(), 251)
        .unwrap_err();
    assert_eq!(guess_err.code, "not_connected");

    let guess_token = room.turn_token;
    room.submit_guess(&voters[1], guess_token, "connected fake".to_string(), 252)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    let vote_err = room
        .submit_vote(&voters[0], room.turn_token, truth, 253)
        .unwrap_err();
    assert_eq!(vote_err.code, "not_connected");
}

#[test]
fn advances_through_guess_vote_and_scores() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    let prompts = room.round.prompts.clone();
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);

    let guess_token = room.turn_token;
    let artist = room.round.current_artist_id.clone().unwrap();
    let voters: Vec<String> = room
        .players
        .keys()
        .filter(|id| *id != &artist)
        .cloned()
        .collect();
    room.submit_guess(&voters[0], guess_token, "a fake answer".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "another fake".to_string(), 300)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);

    let vote_token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    room.submit_vote(&voters[0], vote_token, truth.clone(), 400)
        .unwrap();
    room.submit_vote(&voters[1], vote_token, truth, 400)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    assert_eq!(
        result.correct_answer,
        prompts.get(&artist).unwrap().to_string()
    );
    let deltas: BTreeMap<String, i32> = result
        .score_deltas
        .iter()
        .map(|delta| (delta.player_id.clone(), delta.delta))
        .collect();
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
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    for player_id in ["p1", "p2", "p3"] {
        room.submit_drawing(player_id, drawing_token, drawing(), 200)
            .unwrap();
    }
    let artist = room.round.current_artist_id.clone().unwrap();
    let voters: Vec<String> = room
        .players
        .keys()
        .filter(|id| *id != &artist)
        .cloned()
        .collect();
    let guess_token = room.turn_token;
    room.submit_guess(&voters[0], guess_token, "fake a".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "fake b".to_string(), 300)
        .unwrap();
    let vote_token = room.turn_token;
    let fake_for_first = room
        .round
        .voting_options
        .iter()
        .find(|option| {
            !option.is_correct && option.author_player_id.as_deref() == Some(voters[1].as_str())
        })
        .unwrap()
        .id
        .clone();
    let fake_for_second = room
        .round
        .voting_options
        .iter()
        .find(|option| {
            !option.is_correct && option.author_player_id.as_deref() == Some(voters[0].as_str())
        })
        .unwrap()
        .id
        .clone();
    room.submit_vote(&voters[0], vote_token, fake_for_first, 400)
        .unwrap();
    room.submit_vote(&voters[1], vote_token, fake_for_second, 400)
        .unwrap();
    let result = room.round.result.as_ref().unwrap();
    assert!(result.nobody_found_it);
    assert!(!result.perfect_truth);
    let deltas: BTreeMap<String, i32> = result
        .score_deltas
        .iter()
        .map(|delta| (delta.player_id.clone(), delta.delta))
        .collect();
    // Artist gets nobody-found +50; each fake author gets +50 from the other voter's pick.
    assert_eq!(deltas.get(&artist), Some(&50));
    assert_eq!(deltas.get(&voters[0]), Some(&50));
    assert_eq!(deltas.get(&voters[1]), Some(&50));
}

#[test]
fn results_deadline_auto_advances() {
    let mut room = room_with_players();
    room.update_settings(custom_settings(), 50).unwrap();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    for player_id in ["p1", "p2", "p3"] {
        room.submit_drawing(player_id, drawing_token, drawing(), 200)
            .unwrap();
    }
    let artist = room.round.current_artist_id.clone().unwrap();
    let voters: Vec<String> = room
        .players
        .keys()
        .filter(|id| *id != &artist)
        .cloned()
        .collect();
    let guess_token = room.turn_token;
    room.submit_guess(&voters[0], guess_token, "fake a".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "fake b".to_string(), 300)
        .unwrap();
    let vote_token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    room.submit_vote(&voters[0], vote_token, truth.clone(), 400)
        .unwrap();
    room.submit_vote(&voters[1], vote_token, truth, 400)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    let deadline = room.deadline_ms.expect("results deadline");
    let event = room.advance_if_expired(deadline).unwrap();
    // Custom settings use 2 rounds × 3 drawings — first results expiry advances to next artist.
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
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();

    let mut revealed_artists = BTreeSet::new();
    for turn in 0..3 {
        assert_eq!(room.phase, GamePhase::Guessing);
        let artist = room.round.current_artist_id.clone().unwrap();
        revealed_artists.insert(artist.clone());
        let voters: Vec<String> = room
            .players
            .keys()
            .filter(|id| *id != &artist)
            .cloned()
            .collect();
        let guess_token = room.turn_token;
        room.submit_guess(&voters[0], guess_token, format!("fake {turn} a"), 300)
            .unwrap();
        room.submit_guess(&voters[1], guess_token, format!("fake {turn} b"), 300)
            .unwrap();
        let vote_token = room.turn_token;
        let truth = room
            .round
            .voting_options
            .iter()
            .find(|option| option.is_correct)
            .unwrap()
            .id
            .clone();
        room.submit_vote(&voters[0], vote_token, truth.clone(), 400)
            .unwrap();
        room.submit_vote(&voters[1], vote_token, truth, 400)
            .unwrap();
        assert_eq!(room.phase, GamePhase::Results);
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
    assert_eq!(player.name, "Ada Again");
    assert_eq!(room.players.len(), 3);
}

#[test]
fn start_allows_one_connected_player() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);

    room.handle_start_or_advance(100).unwrap();

    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.players.len(), 1);
    assert!(room.players.contains_key("p1"));
    assert_eq!(room.round.order, vec!["p1".to_string()]);
}

#[test]
fn solo_round_skips_guessing_and_voting_after_drawing() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 11);
    room.handle_start_or_advance(100).unwrap();

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
}

#[test]
fn start_prunes_disconnected_lobby_players() {
    let mut room = room_with_players();
    room.mark_disconnected("p3", 10);

    room.handle_start_or_advance(100).unwrap();

    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.players.len(), 2);
    assert!(!room.players.contains_key("p3"));
    assert_eq!(room.round.order.len(), 2);
}

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
fn rejects_empty_drawing() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let err = room
        .submit_drawing("p1", room.turn_token, empty_drawing(), 200)
        .unwrap_err();
    assert_eq!(err.code, "blank_drawing");
}

#[test]
fn drawing_timeout_without_submissions_returns_to_lobby() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    let event = room
        .advance_if_expired(100 + room.settings.draw_seconds * 1000)
        .unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Lobby);
    assert_eq!(room.current_round, 0);
    assert!(room.deadline_ms.is_none());
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
fn guessing_timeout_without_guesses_skips_to_results() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);

    let event = room
        .advance_if_expired(200 + room.settings.guess_seconds * 1000)
        .unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    assert_eq!(room.phase, GamePhase::Results);
    assert!(room.round.result.is_some());
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
    let token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .map(|option| option.id.clone())
        .unwrap();
    assert_eq!(
        room.submit_vote("spec", token, truth, 230)
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
    assert_eq!(room.phase, GamePhase::Guessing);
    let voters = non_artist_ids(&room);
    assert_eq!(voters.len(), 2);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "fake one".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], token, "fake two".to_string(), 301)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    let token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .map(|option| option.id.clone())
        .unwrap();
    room.submit_vote(&voters[0], token, truth.clone(), 400)
        .unwrap();
    room.submit_vote(&voters[1], token, truth, 401).unwrap();
    assert_eq!(room.phase, GamePhase::Results);
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
    assert_eq!(room.phase, GamePhase::Drawing);

    room.upsert_player("p4".to_string(), "Spect".to_string(), 200)
        .unwrap();
    assert!(room.players.get("p4").unwrap().spectator);
    assert!(!room.round.prompts.contains_key("p4"));
    assert!(!room.round.order.contains(&"p4".to_string()));

    let drawing_token = room.turn_token;
    for player_id in ["p1", "p2", "p3"] {
        room.submit_drawing(player_id, drawing_token, drawing(), 300)
            .unwrap();
    }
    assert_eq!(room.phase, GamePhase::Guessing);
    assert!(room
        .submit_guess("p4", room.turn_token, "nope".to_string(), 400)
        .is_err());

    for _ in 0..3 {
        let artist = room.round.current_artist_id.clone().unwrap();
        let voters: Vec<String> = room
            .players
            .values()
            .filter(|player| !player.spectator && player.id != artist)
            .map(|player| player.id.clone())
            .collect();
        let guess_token = room.turn_token;
        for voter in &voters {
            room.submit_guess(voter, guess_token, format!("fake-{voter}"), 500)
                .unwrap();
        }
        let vote_token = room.turn_token;
        let correct = room
            .round
            .voting_options
            .iter()
            .find(|option| option.is_correct)
            .unwrap()
            .id
            .clone();
        for voter in &voters {
            room.submit_vote(voter, vote_token, correct.clone(), 600)
                .unwrap();
        }
        room.handle_start_or_advance(700).unwrap();
    }

    assert_eq!(room.phase, GamePhase::Drawing);
    assert!(!room.players.get("p4").unwrap().spectator);
    assert!(room.round.prompts.contains_key("p4"));
    assert!(room.round.order.contains(&"p4".to_string()));
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

fn stroke_with_points(points: Vec<Point>, color: &str, size: u8) -> Stroke {
    Stroke {
        color: color.to_string(),
        size,
        points,
    }
}

fn drawing_with_strokes(strokes: Vec<Stroke>) -> DrawingDoc {
    DrawingDoc {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        strokes,
    }
}

fn reach_guessing(room: &mut Room, now_ms: u64) {
    room.handle_start_or_advance(now_ms).unwrap();
    submit_all_drawings(room, now_ms + 100);
    assert_eq!(room.phase, GamePhase::Guessing);
}

fn reach_voting(room: &mut Room, now_ms: u64) -> Vec<String> {
    reach_guessing(room, now_ms);
    let voters = non_artist_ids(room);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "fake alpha".to_string(), now_ms + 200)
        .unwrap();
    room.submit_guess(&voters[1], token, "fake beta".to_string(), now_ms + 201)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    voters
}

fn deltas_map(room: &Room) -> BTreeMap<String, i32> {
    room.round
        .result
        .as_ref()
        .unwrap()
        .score_deltas
        .iter()
        .map(|delta| (delta.player_id.clone(), delta.delta))
        .collect()
}

#[test]
fn sanitize_name_and_guess_boundaries() {
    assert_eq!(sanitize_name("   "), "Player");
    assert_eq!(sanitize_name(""), "Player");
    assert_eq!(sanitize_name("  Ada  "), "Ada");
    let long = "A".repeat(MAX_NAME_LEN + 10);
    assert_eq!(sanitize_name(&long).chars().count(), MAX_NAME_LEN);
    // Multi-byte truncation is by char, not byte.
    let unicode = "😀".repeat(MAX_NAME_LEN + 2);
    assert_eq!(sanitize_name(&unicode).chars().count(), MAX_NAME_LEN);

    assert_eq!(sanitize_guess("   ").unwrap_err().code, "empty_guess");
    assert_eq!(sanitize_guess("").unwrap_err().code, "empty_guess");
    let long_guess = "x".repeat(MAX_GUESS_LEN + 20);
    assert_eq!(
        sanitize_guess(&long_guess).unwrap().chars().count(),
        MAX_GUESS_LEN
    );
}

#[test]
fn validate_drawing_rejects_malformed_payloads_and_accepts_limits() {
    assert_eq!(
        validate_drawing(&DrawingDoc {
            width: CANVAS_WIDTH - 1,
            height: CANVAS_HEIGHT,
            strokes: drawing().strokes,
        })
        .unwrap_err()
        .code,
        "invalid_drawing_size"
    );
    assert_eq!(
        validate_drawing(&empty_drawing()).unwrap_err().code,
        "blank_drawing"
    );

    let too_many_strokes = drawing_with_strokes(
        (0..=MAX_STROKES)
            .map(|_| {
                stroke_with_points(
                    vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }],
                    "#111111",
                    6,
                )
            })
            .collect(),
    );
    assert_eq!(
        validate_drawing(&too_many_strokes).unwrap_err().code,
        "drawing_too_large"
    );

    let at_stroke_cap = drawing_with_strokes(
        (0..MAX_STROKES)
            .map(|_| {
                stroke_with_points(
                    vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }],
                    "#abcdef",
                    1,
                )
            })
            .collect(),
    );
    validate_drawing(&at_stroke_cap).unwrap();

    let too_many_points = drawing_with_strokes(vec![stroke_with_points(
        (0..=MAX_POINTS_PER_STROKE)
            .map(|i| Point {
                x: (i as u16) % CANVAS_WIDTH,
                y: 1,
            })
            .collect(),
        "#111111",
        6,
    )]);
    assert_eq!(
        validate_drawing(&too_many_points).unwrap_err().code,
        "stroke_too_large"
    );

    let at_point_cap = drawing_with_strokes(vec![stroke_with_points(
        (0..MAX_POINTS_PER_STROKE)
            .map(|i| Point {
                x: (i as u16) % CANVAS_WIDTH,
                y: 1,
            })
            .collect(),
        "#111111",
        32,
    )]);
    validate_drawing(&at_point_cap).unwrap();

    assert_eq!(
        validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
            vec![Point { x: 1, y: 1 }],
            "#111111",
            6,
        )]))
        .unwrap_err()
        .code,
        "stroke_too_short"
    );
    assert_eq!(
        validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
            vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }],
            "#111111",
            0,
        )]))
        .unwrap_err()
        .code,
        "invalid_brush"
    );
    assert_eq!(
        validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
            vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }],
            "#111111",
            33,
        )]))
        .unwrap_err()
        .code,
        "invalid_brush"
    );
    for bad_color in ["#GGG000", "#11223344", "111111", "#abc", ""] {
        assert_eq!(
            validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
                vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }],
                bad_color,
                6,
            )]))
            .unwrap_err()
            .code,
            "invalid_color",
            "color {bad_color}"
        );
    }
    assert_eq!(
        validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
            vec![
                Point {
                    x: CANVAS_WIDTH + 1,
                    y: 1
                },
                Point { x: 2, y: 2 }
            ],
            "#111111",
            6,
        )]))
        .unwrap_err()
        .code,
        "point_out_of_bounds"
    );
    // Inclusive canvas edge is allowed.
    validate_drawing(&drawing_with_strokes(vec![stroke_with_points(
        vec![
            Point {
                x: CANVAS_WIDTH,
                y: CANVAS_HEIGHT
            },
            Point { x: 0, y: 0 }
        ],
        "#ABCDEF",
        6,
    )]))
    .unwrap();
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
    assert_eq!(room.players.get("p0").unwrap().name, "Back");
    assert_eq!(room.players.len(), MAX_PLAYERS);
}

#[test]
fn artist_cannot_guess_or_vote_and_vote_constraints_hold() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let token = room.turn_token;
    assert_eq!(
        room.submit_guess(&artist, token, "artist fake".to_string(), 400)
            .unwrap_err()
            .code,
        "invalid_phase"
    );

    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    assert_eq!(
        room.submit_vote(&artist, token, truth.clone(), 401)
            .unwrap_err()
            .code,
        "artist_action"
    );
    assert_eq!(
        room.submit_vote(&voters[0], token, "missing-option".to_string(), 402)
            .unwrap_err()
            .code,
        "invalid_vote"
    );

    let own_fake = room
        .round
        .voting_options
        .iter()
        .find(|option| option.author_player_id.as_deref() == Some(voters[0].as_str()))
        .unwrap()
        .id
        .clone();
    assert_eq!(
        room.submit_vote(&voters[0], token, own_fake, 403)
            .unwrap_err()
            .code,
        "own_guess"
    );

    room.submit_vote(&voters[0], token, truth.clone(), 404)
        .unwrap();
    room.submit_vote(&voters[1], token, truth, 405).unwrap();
    assert_eq!(room.phase, GamePhase::Results);
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
fn guess_matching_truth_is_deduped_and_duplicates_collapse() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let truth = room.round.prompts.get(&artist).unwrap().clone();
    let voters = non_artist_ids(&room);
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, format!("  {truth}  "), 300)
        .unwrap();
    room.submit_guess(&voters[1], token, truth.to_uppercase(), 301)
        .unwrap();
    // Both guesses normalize to truth → only the real option remains → skip voting.
    assert_eq!(room.phase, GamePhase::Results);
    assert_eq!(room.round.voting_options.len(), 1);
    assert!(room.round.voting_options[0].is_correct);
}

#[test]
fn duplicate_normalized_guesses_collapse_to_one_option() {
    let mut room = room_with_players();
    let voters = {
        reach_guessing(&mut room, 100);
        non_artist_ids(&room)
    };
    let token = room.turn_token;
    room.submit_guess(&voters[0], token, "  Same Fake  ".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], token, "same fake".to_string(), 301)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    let fake_options: Vec<_> = room
        .round
        .voting_options
        .iter()
        .filter(|option| !option.is_correct)
        .collect();
    assert_eq!(fake_options.len(), 1);
    // sanitize_guess trims before storage; first trimmed text wins.
    assert_eq!(fake_options[0].text, "Same Fake");
}

#[test]
fn mixed_votes_score_correct_and_fake_author_exactly() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let artist = room.round.current_artist_id.clone().unwrap();
    let token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    let fake_of_second = room
        .round
        .voting_options
        .iter()
        .find(|option| option.author_player_id.as_deref() == Some(voters[1].as_str()))
        .unwrap()
        .id
        .clone();
    room.submit_vote(&voters[0], token, fake_of_second, 400)
        .unwrap();
    room.submit_vote(&voters[1], token, truth, 401).unwrap();
    let deltas = deltas_map(&room);
    assert!(!room.round.result.as_ref().unwrap().perfect_truth);
    assert!(!room.round.result.as_ref().unwrap().nobody_found_it);
    // voters[1] correct: +200; artist: +100; voters[1] also authored fake that voters[0] picked: +50
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
    assert_eq!(room.phase, GamePhase::Voting);
    room.mark_disconnected(&voters[1], 350);
    let vote_token = room.turn_token;
    let truth = room
        .round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .unwrap()
        .id
        .clone();
    room.submit_vote(&voters[0], vote_token, truth, 400)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    let result = room.round.result.as_ref().unwrap();
    assert!(!result.perfect_truth);
    let deltas = deltas_map(&room);
    // Connected voter only: +200, no perfect +25.
    assert_eq!(deltas.get(&voters[0]), Some(&200));
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
fn drawing_timeout_with_partial_submissions_enters_guessing() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let token = room.turn_token;
    room.submit_drawing("p1", token, drawing(), 200).unwrap();
    room.submit_drawing("p2", token, drawing(), 201).unwrap();
    // p3 never submits
    let deadline = room.deadline_ms.unwrap();
    room.advance_if_expired(deadline).unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.round.drawings.len(), 2);
    assert!(!room.round.order.contains(&"p3".to_string()) || {
        // order may still list p3 if they were assigned a prompt, but no drawing turn without art
        !room.round.drawings.contains_key("p3")
    });
    // Current artist must be one of the drawers.
    let artist = room.round.current_artist_id.clone().unwrap();
    assert!(room.round.drawings.contains_key(&artist));
}

#[test]
fn all_eligible_guessers_disconnect_advances_via_ready() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    for voter in &voters {
        room.mark_disconnected(voter, 250);
    }
    let event = room.advance_if_ready(251).unwrap();
    assert_eq!(event, Some(EngineEvent::PhaseChanged));
    // No guesses → voting skipped → results.
    assert_eq!(room.phase, GamePhase::Results);
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
fn submit_reaction_rules_and_cooldown() {
    let mut room = room_with_players();
    assert!(room.submit_reaction("p1", "😂", 50).unwrap().is_none()); // lobby: silent no-op

    reach_guessing(&mut room, 100);
    assert_eq!(
        room.submit_reaction("p1", "🙂", 300)
            .unwrap_err()
            .code,
        "invalid_reaction"
    );
    assert_eq!(
        room.submit_reaction("missing", "😂", 301)
            .unwrap_err()
            .code,
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
    // Internal state still knows the truth.
    assert!(room.round.voting_options.iter().any(|option| option.is_correct));
}

#[test]
fn invalid_phase_actions_are_rejected() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    assert_eq!(
        room.submit_vote("p1", room.turn_token, "option-0".to_string(), 101)
            .unwrap_err()
            .code,
        "invalid_phase"
    );
    assert_eq!(
        room.handle_start_or_advance(102).unwrap_err().code,
        "invalid_phase"
    );
    assert_eq!(
        room.set_name("ghost", "Nope".to_string(), 103)
            .unwrap_err()
            .code,
        "not_joined"
    );

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
fn empty_guess_rejected_and_stale_token_after_dropout_advance() {
    let mut room = room_with_players();
    reach_guessing(&mut room, 100);
    let voters = non_artist_ids(&room);
    assert_eq!(
        room.submit_guess(&voters[0], room.turn_token, "   ".to_string(), 300)
            .unwrap_err()
            .code,
        "empty_guess"
    );

    let stale = room.turn_token;
    room.mark_disconnected(&voters[1], 310);
    room.submit_guess(&voters[0], stale, "only one".to_string(), 320)
        .unwrap();
    // Advanced to voting (or results if <2 options) — stale guessing token fails.
    assert_ne!(room.phase, GamePhase::Guessing);
    assert_eq!(
        room.submit_guess(&voters[0], stale, "late".to_string(), 330)
            .unwrap_err()
            .code,
        "invalid_phase"
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
        let artist = room.round.current_artist_id.clone().unwrap();
        let voters = non_artist_ids(&room);
        let guess_token = room.turn_token;
        for (i, voter) in voters.iter().enumerate() {
            room.submit_guess(voter, guess_token, format!("fake-{i}"), 300)
                .unwrap();
        }
        let vote_token = room.turn_token;
        let truth = room
            .round
            .voting_options
            .iter()
            .find(|option| option.is_correct)
            .unwrap()
            .id
            .clone();
        for voter in &voters {
            room.submit_vote(voter, vote_token, truth.clone(), 400)
                .unwrap();
        }
        assert_eq!(room.phase, GamePhase::Results);
        let _ = artist;
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
