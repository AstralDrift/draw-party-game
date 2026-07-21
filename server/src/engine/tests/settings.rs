use super::super::*;
use super::helpers::*;
use crate::protocol::{DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID};

#[test]
fn snapshot_includes_settings_and_server_clock() {
    let room = room_with_players();
    let snapshot = room.snapshot(12345);
    assert_eq!(snapshot.settings, RoomSettings::default());
    assert_eq!(snapshot.settings.rounds, 2);
    assert_eq!(snapshot.settings.draw_seconds, 75);
    assert_eq!(snapshot.settings.guess_seconds, 30);
    assert_eq!(snapshot.settings.vote_seconds, 20);
    assert_eq!(snapshot.settings.results_seconds, 8);
    assert_eq!(snapshot.game_mode, GameMode::Party);
    assert!(!snapshot.deadline_extension_available);
    assert_eq!(snapshot.server_now_ms, 12345);
    assert_eq!(snapshot.total_rounds, RoomSettings::default().rounds);
}

#[test]
fn updates_settings_in_lobby_and_uses_custom_deadlines() {
    let mut room = room_with_players();
    room.update_settings(custom_settings(), 50).unwrap();
    assert_eq!(room.settings, custom_settings());

    room.handle_start_or_advance(100).unwrap();
    assert_eq!(room.deadline_ms, Some(100 + 60_000));
    let drawing_token = room.turn_token;
    room.submit_drawing("p1", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p2", drawing_token, drawing(), 200)
        .unwrap();
    room.submit_drawing("p3", drawing_token, drawing(), 200)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert_eq!(room.deadline_ms, Some(200 + 20_000));

    let voters = non_artist_ids(&room);
    let guess_token = room.turn_token;
    room.submit_guess(&voters[0], guess_token, "fake one".to_string(), 300)
        .unwrap();
    room.submit_guess(&voters[1], guess_token, "fake two".to_string(), 300)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Voting);
    assert_eq!(room.deadline_ms, Some(300 + 15_000));
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
fn drawing_retry_allows_timer_changes_and_reuses_its_assignments() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let assigned_prompts = room.round.prompts.clone();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    assert_eq!(room.phase, GamePhase::Lobby);

    let mut longer_timer = room.settings.clone();
    longer_timer.draw_seconds += 15;
    room.update_settings(longer_timer.clone(), 201).unwrap();
    room.handle_start_or_advance(300).unwrap();
    assert_eq!(room.settings, longer_timer);
    assert_eq!(room.round.prompts, assigned_prompts);
    assert_eq!(
        room.deadline_ms,
        Some(300 + longer_timer.draw_seconds * 1000)
    );
}

#[test]
fn prompt_pack_change_abandons_a_blank_retry_without_erasing_prompt_history() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let used_prompts = room.used_prompt_keys.clone();
    room.players.get_mut("p1").unwrap().score = 123;
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();

    let mut invalid_pack = room.settings.clone();
    invalid_pack.prompt_pack_id = "unknown".to_string();
    assert_eq!(
        room.update_settings(invalid_pack, 199).unwrap_err().code,
        "invalid_prompt_pack"
    );
    assert!(room.pending_drawing_retry.is_some());
    assert_eq!(room.current_round, 1);

    let mut changed_pack = room.settings.clone();
    changed_pack.prompt_pack_id = PARTY_CHAOS_PROMPT_PACK_ID.to_string();
    assert_eq!(
        room.update_settings(changed_pack.clone(), 200).unwrap(),
        EngineEvent::Snapshot
    );
    assert_eq!(room.settings, changed_pack);
    assert!(room.pending_drawing_retry.is_none());
    assert_eq!(room.current_round, 0);
    assert_eq!(room.used_prompt_keys, used_prompts);

    room.handle_start_or_advance(300).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    assert!(room.players.values().all(|player| player.score == 0));
}

#[test]
fn prompt_pack_change_makes_connected_turnover_players_eligible_in_the_fresh_lobby() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();

    for player_id in ["p1", "p2", "p3"] {
        room.mark_disconnected(player_id, 200);
    }
    for (index, player_id) in ["p4", "p5", "p6"].into_iter().enumerate() {
        room.upsert_player(
            player_id.to_string(),
            format!("Replacement {index}"),
            201 + index as u64,
        )
        .unwrap();
        assert!(room.players.get(player_id).unwrap().spectator);
    }
    assert_eq!(
        room.players
            .values()
            .filter(|player| player.connected && !player.spectator)
            .count(),
        0
    );

    let mut changed_pack = room.settings.clone();
    changed_pack.prompt_pack_id = PARTY_CHAOS_PROMPT_PACK_ID.to_string();
    room.update_settings(changed_pack, 210).unwrap();

    assert_eq!(room.phase, GamePhase::Lobby);
    assert!(room.pending_drawing_retry.is_none());
    for player_id in ["p4", "p5", "p6"] {
        let replacement = room.players.get(player_id).unwrap();
        assert!(replacement.connected);
        assert!(!replacement.spectator);
    }

    room.handle_start_or_advance(300).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.round.prompts.len(), 3);
    for player_id in ["p4", "p5", "p6"] {
        assert!(room.round.prompts.contains_key(player_id));
    }
}

#[test]
fn clamps_legacy_numeric_settings_and_rejects_invalid_prompt_pack() {
    let mut room = room_with_players();

    let mut unknown_pack = custom_settings();
    unknown_pack.prompt_pack_id = "unknown".to_string();
    assert_eq!(
        room.update_settings(unknown_pack, 50).unwrap_err().code,
        "invalid_prompt_pack"
    );

    let legacy_low = RoomSettings {
        rounds: 0,
        draw_seconds: 30,
        guess_seconds: 15,
        vote_seconds: 10,
        results_seconds: 5,
        prompt_pack_id: DEFAULT_PROMPT_PACK_ID.to_string(),
    };
    room.update_settings(legacy_low, 51).unwrap();
    assert_eq!(room.settings.rounds, MIN_ROUNDS);
    assert_eq!(room.settings.draw_seconds, MIN_DRAW_SECONDS);
    assert_eq!(room.settings.guess_seconds, MIN_GUESS_SECONDS);
    assert_eq!(room.settings.vote_seconds, MIN_VOTE_SECONDS);
    assert_eq!(room.settings.results_seconds, MIN_RESULTS_SECONDS);

    let legacy_high = RoomSettings {
        rounds: 12,
        draw_seconds: 180,
        guess_seconds: 120,
        vote_seconds: 90,
        results_seconds: 30,
        prompt_pack_id: format!("  {PARTY_CHAOS_PROMPT_PACK_ID}  "),
    };
    room.update_settings(legacy_high, 52).unwrap();
    assert_eq!(room.settings.rounds, MAX_ROUNDS);
    assert_eq!(room.settings.draw_seconds, MAX_DRAW_SECONDS);
    assert_eq!(room.settings.guess_seconds, MAX_GUESS_SECONDS);
    assert_eq!(room.settings.vote_seconds, MAX_VOTE_SECONDS);
    assert_eq!(room.settings.results_seconds, MAX_RESULTS_SECONDS);
    assert_eq!(room.settings.prompt_pack_id, PARTY_CHAOS_PROMPT_PACK_ID);
}
