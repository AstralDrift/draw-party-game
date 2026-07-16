use super::*;
use crate::protocol::DEFAULT_PROMPT_PACK_ID;

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
    assert_eq!(room.deadline_ms, Some(100 + 90_000));
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
    let err = room.update_settings(settings, 50).unwrap_err();
    assert_eq!(err.code, "invalid_settings");

    let mut settings = custom_settings();
    settings.prompt_pack_id = "unknown".to_string();
    let err = room.update_settings(settings, 51).unwrap_err();
    assert_eq!(err.code, "invalid_prompt_pack");
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
fn blocks_duplicate_drawing_submission() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let token = room.turn_token;
    room.submit_drawing("p1", token, drawing(), 200).unwrap();
    let err = room
        .submit_drawing("p1", token, drawing(), 201)
        .unwrap_err();
    assert_eq!(err.code, "duplicate_submission");
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
fn blocks_duplicate_guess_submission() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();

    let guess_token = room.turn_token;
    let artist = room.round.current_artist_id.clone().unwrap();
    let voter = room
        .players
        .keys()
        .find(|id| *id != &artist)
        .cloned()
        .unwrap();
    room.submit_guess(&voter, guess_token, "first fake".to_string(), 300)
        .unwrap();
    let err = room
        .submit_guess(&voter, guess_token, "second fake".to_string(), 301)
        .unwrap_err();
    assert_eq!(err.code, "duplicate_submission");
}

#[test]
fn blocks_duplicate_vote_submission() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();

    let guess_token = room.turn_token;
    let artist = room.round.current_artist_id.clone().unwrap();
    let voters: Vec<String> = room
        .players
        .keys()
        .filter(|id| *id != &artist)
        .cloned()
        .collect();
    room.submit_guess(&voters[0], guess_token, "first fake".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "second fake".to_string(), 300)
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
    let err = room
        .submit_vote(&voters[0], vote_token, truth, 401)
        .unwrap_err();
    assert_eq!(err.code, "duplicate_submission");
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
    let artist_delta = result
        .score_deltas
        .iter()
        .find(|delta| delta.player_id == artist)
        .map(|delta| delta.delta)
        .unwrap_or_default();
    assert!(artist_delta >= 50);
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
    assert!(matches!(
        event,
        Some(EngineEvent::PhaseChanged) | Some(EngineEvent::FinalScores)
    ));
    assert_ne!(room.phase, GamePhase::Results);
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
fn lobby_join_creates_normal_player() {
    let mut room = Room::new(
        "ABCD".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
        .unwrap();
    assert!(!room.players.get("p1").unwrap().spectator);
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
        room.submit_vote("spec", token, truth, 230).unwrap_err().code,
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
    room.submit_vote(&voters[1], token, truth, 401)
        .unwrap();
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
