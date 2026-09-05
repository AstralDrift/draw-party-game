use super::super::*;
use super::helpers::{continue_after_show, play_guesses_then_vote_truth, submit_all_drawings};
use crate::prompts::prompt_pack_prompts;
use crate::protocol::{DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID};
use std::collections::BTreeSet;

#[test]
fn maximum_game_assigns_each_selected_pack_prompt_only_once() {
    for prompt_pack_id in [DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID] {
        assert_maximum_game_uses_pack_without_repeats(prompt_pack_id);
    }
}

fn assert_maximum_game_uses_pack_without_repeats(prompt_pack_id: &str) {
    let mut room = room_with_player_count(MAX_PLAYERS);
    let settings = RoomSettings {
        rounds: MAX_ROUNDS,
        prompt_pack_id: prompt_pack_id.to_string(),
        ..RoomSettings::default()
    };
    room.update_settings(settings, 10).unwrap();
    room.handle_start_or_advance(20).unwrap();

    let selected_pack: BTreeSet<String> = prompt_pack_prompts(prompt_pack_id)
        .unwrap()
        .iter()
        .map(|prompt| normalized(prompt))
        .collect();

    for round_index in 0..MAX_ROUNDS as usize {
        assert_eq!(room.phase, GamePhase::Drawing);
        assert_eq!(room.current_round as usize, round_index + 1);
        assert_eq!(room.round.prompts.len(), MAX_PLAYERS);

        let assigned_prompts = room.round.prompts.clone();
        let assigned_order = room.round.order.clone();
        let used_before_retry = room.used_prompt_keys.clone();
        let scores_before_retry: Vec<(String, i32)> = room
            .players
            .values()
            .map(|player| (player.id.clone(), player.score))
            .collect();
        let retry_at = room.deadline_ms.unwrap();
        room.advance_if_expired(retry_at).unwrap();
        assert_eq!(room.phase, GamePhase::Lobby);
        assert_eq!(room.current_round as usize, round_index + 1);
        assert_eq!(room.used_prompt_keys, used_before_retry);
        room.handle_start_or_advance(retry_at + 1).unwrap();
        assert_eq!(room.round.prompts, assigned_prompts);
        assert_eq!(room.round.order, assigned_order);
        assert_eq!(
            room.players
                .values()
                .map(|player| (player.id.clone(), player.score))
                .collect::<Vec<_>>(),
            scores_before_retry
        );

        let round_prompts: BTreeSet<String> = room
            .round
            .prompts
            .values()
            .map(|prompt| normalized(prompt))
            .collect();
        assert_eq!(round_prompts.len(), MAX_PLAYERS);
        assert!(round_prompts.is_subset(&selected_pack));
        assert_eq!(room.used_prompt_keys.len(), (round_index + 1) * MAX_PLAYERS);

        submit_all_drawings(&mut room, retry_at + 2);
        for _ in 0..MAX_PLAYERS {
            play_guesses_then_vote_truth(&mut room, retry_at + 3);
            continue_after_show(&mut room);
        }
    }

    assert_eq!(room.phase, GamePhase::FinalScores);
    assert_eq!(
        room.used_prompt_keys.len(),
        MAX_PLAYERS * MAX_ROUNDS as usize
    );
}

#[test]
fn invalid_selected_pack_fails_before_game_state_changes() {
    let mut room = room_with_player_count(3);
    room.settings.prompt_pack_id = "missing-pack".to_string();

    let error = room.handle_start_or_advance(20).unwrap_err();

    assert_eq!(error.code, "invalid_prompt_pack");
    assert_eq!(room.phase, GamePhase::Lobby);
    assert_eq!(room.current_round, 0);
    assert!(room.round.prompts.is_empty());
    assert!(room.used_prompt_keys.is_empty());
}

#[test]
fn empty_drawing_timeout_suspends_and_reuses_the_same_assignments() {
    let mut room = room_with_player_count(MAX_PLAYERS);
    room.settings.rounds = MAX_ROUNDS;
    room.handle_start_or_advance(20).unwrap();
    let assigned_prompts = room.round.prompts.clone();
    let assigned_order = room.round.order.clone();
    let used_prompts = room.used_prompt_keys.clone();
    let expired_token = room.turn_token;

    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();

    assert_eq!(room.phase, GamePhase::Lobby);
    assert_eq!(room.current_round, 1);
    assert_eq!(room.used_prompt_keys, used_prompts);
    assert!(room.round.prompts.is_empty());

    room.handle_start_or_advance(30).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    assert_eq!(room.round.prompts, assigned_prompts);
    assert_eq!(room.round.order, assigned_order);
    assert!(room.turn_token > expired_token);
    assert_eq!(room.used_prompt_keys.len(), MAX_PLAYERS);
}

#[test]
fn full_retry_roster_can_replace_a_departed_assignment_without_growing() {
    let mut room = room_with_player_count(MAX_PLAYERS);
    room.handle_start_or_advance(20).unwrap();
    let assigned_prompts: BTreeSet<String> = room.round.prompts.values().cloned().collect();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    let departed_scorer = room.pending_drawing_retry.as_ref().unwrap().order[0].clone();
    room.players.get_mut(&departed_scorer).unwrap().score = 123;
    for index in 0..MAX_PLAYERS {
        room.mark_disconnected(&format!("p{index}"), 30 + index as u64);
    }

    room.upsert_player("replacement".to_string(), "Replacement".to_string(), 50)
        .unwrap();

    assert_eq!(room.players.len(), MAX_PLAYERS);
    assert_eq!(room.retired_scores.len(), 1);
    room.handle_start_or_advance(60).unwrap();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert!(assigned_prompts.contains(room.round.prompts.get("replacement").unwrap()));
    assert!(!room.players.get("replacement").unwrap().spectator);
    assert_eq!(
        room.final_scores()
            .iter()
            .find(|score| score.player_id == departed_scorer)
            .map(|score| score.score),
        Some(123)
    );
}

#[test]
fn displaced_prompt_owner_cannot_inherit_another_prompt_during_retry() {
    let mut room = room_with_player_count(MAX_PLAYERS);
    room.handle_start_or_advance(20).unwrap();
    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();

    let departed_owner = room.pending_drawing_retry.as_ref().unwrap().order[0].clone();
    let second_departure = room.pending_drawing_retry.as_ref().unwrap().order[1].clone();
    let departed_prompt = room
        .pending_drawing_retry
        .as_ref()
        .unwrap()
        .prompts
        .get(&departed_owner)
        .unwrap()
        .clone();
    room.players.get_mut(&departed_owner).unwrap().score = 123;

    room.mark_disconnected(&departed_owner, 30);
    room.upsert_player("replacement-a".to_string(), "Replacement A".to_string(), 31)
        .unwrap();
    assert_eq!(
        room.pending_drawing_retry
            .as_ref()
            .unwrap()
            .prompts
            .get("replacement-a"),
        Some(&departed_prompt)
    );

    room.mark_disconnected(&second_departure, 32);
    let error = room
        .upsert_player(departed_owner.clone(), "Returned Owner".to_string(), 33)
        .unwrap_err();
    assert_eq!(error.code, "room_full");
    assert!(!room.players.contains_key(&departed_owner));

    room.upsert_player("replacement-b".to_string(), "Replacement B".to_string(), 34)
        .unwrap();
    room.handle_start_or_advance(40).unwrap();
    assert!(room.round.prompts.contains_key("replacement-a"));
    assert!(room.round.prompts.contains_key("replacement-b"));
    assert!(!room.round.prompts.contains_key(&departed_owner));
    assert_eq!(
        room.final_scores()
            .iter()
            .find(|score| score.player_id == departed_owner)
            .map(|score| score.score),
        Some(123)
    );

    room.advance_if_expired(room.deadline_ms.unwrap()).unwrap();
    let third_departure = room.pending_drawing_retry.as_ref().unwrap().order[0].clone();
    room.mark_disconnected(&third_departure, 50);
    let error = room
        .upsert_player(departed_owner.clone(), "Returned Owner".to_string(), 51)
        .unwrap_err();
    assert_eq!(error.code, "room_full");
    assert!(!room
        .pending_drawing_retry
        .as_ref()
        .unwrap()
        .prompts
        .contains_key(&departed_owner));
}

#[test]
fn play_again_preserves_prompt_history_while_unused_prompts_remain() {
    let mut room = room_with_player_count(3);
    let settings = RoomSettings {
        rounds: 1,
        ..RoomSettings::default()
    };
    room.update_settings(settings, 10).unwrap();
    room.handle_start_or_advance(20).unwrap();
    let first_game_prompts: BTreeSet<String> = room
        .round
        .prompts
        .values()
        .map(|prompt| normalized(prompt))
        .collect();
    assert_eq!(room.used_prompt_keys.len(), 3);

    submit_all_drawings(&mut room, 30);
    for _ in 0..3 {
        play_guesses_then_vote_truth(&mut room, 40);
        continue_after_show(&mut room);
    }
    assert_eq!(room.phase, GamePhase::FinalScores);
    assert_eq!(room.used_prompt_keys.len(), 3);

    room.handle_start_or_advance(room.deadline_ms.unwrap())
        .unwrap();

    let replay_prompts: BTreeSet<String> = room
        .round
        .prompts
        .values()
        .map(|prompt| normalized(prompt))
        .collect();
    assert_eq!(room.phase, GamePhase::Drawing);
    assert_eq!(room.current_round, 1);
    assert!(first_game_prompts.is_disjoint(&replay_prompts));
    assert!(first_game_prompts.is_subset(&room.used_prompt_keys));
    assert!(replay_prompts.is_subset(&room.used_prompt_keys));
    assert_eq!(room.used_prompt_keys.len(), 6);
}

#[test]
fn prompt_history_rolls_over_only_when_next_full_assignment_will_not_fit() {
    let mut room = room_with_player_count(3);
    let pack = prompt_pack_prompts(DEFAULT_PROMPT_PACK_ID).unwrap();
    room.used_prompt_keys = pack
        .iter()
        .skip(2)
        .map(|prompt| normalized(prompt))
        .collect();

    room.handle_start_or_advance(20).unwrap();

    let assigned: BTreeSet<String> = room
        .round
        .prompts
        .values()
        .map(|prompt| normalized(prompt))
        .collect();
    assert_eq!(assigned.len(), 3);
    assert_eq!(room.used_prompt_keys, assigned);
}

fn room_with_player_count(count: usize) -> Room {
    let mut room = Room::new(
        "DECK".to_string(),
        "display".to_string(),
        "host-token".to_string(),
        0,
    );
    for index in 0..count {
        room.upsert_player(
            format!("p{index}"),
            format!("Player {index}"),
            index as u64 + 1,
        )
        .unwrap();
    }
    room
}

fn normalized(prompt: &str) -> String {
    prompt.trim().to_lowercase()
}
