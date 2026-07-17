use super::super::*;
use super::helpers::*;
use crate::protocol::PARTY_CHAOS_PROMPT_PACK_ID;

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
fn rejects_invalid_room_settings() {
    let mut room = room_with_players();

    let mut unknown_pack = custom_settings();
    unknown_pack.prompt_pack_id = "unknown".to_string();
    assert_eq!(
        room.update_settings(unknown_pack, 50).unwrap_err().code,
        "invalid_prompt_pack"
    );

    let mutators: [(&str, Box<dyn Fn(&mut RoomSettings)>); 10] = [
        ("rounds_low", Box::new(|s| s.rounds = 0)),
        ("rounds_high", Box::new(|s| s.rounds = MAX_ROUNDS + 1)),
        (
            "draw_low",
            Box::new(|s| s.draw_seconds = MIN_DRAW_SECONDS - 1),
        ),
        (
            "draw_high",
            Box::new(|s| s.draw_seconds = MAX_DRAW_SECONDS + 1),
        ),
        (
            "guess_low",
            Box::new(|s| s.guess_seconds = MIN_GUESS_SECONDS - 1),
        ),
        (
            "guess_high",
            Box::new(|s| s.guess_seconds = MAX_GUESS_SECONDS + 1),
        ),
        (
            "vote_low",
            Box::new(|s| s.vote_seconds = MIN_VOTE_SECONDS - 1),
        ),
        (
            "vote_high",
            Box::new(|s| s.vote_seconds = MAX_VOTE_SECONDS + 1),
        ),
        (
            "results_low",
            Box::new(|s| s.results_seconds = MIN_RESULTS_SECONDS - 1),
        ),
        (
            "results_high",
            Box::new(|s| s.results_seconds = MAX_RESULTS_SECONDS + 1),
        ),
    ];
    for (label, mutate) in mutators {
        let mut settings = custom_settings();
        mutate(&mut settings);
        assert_eq!(
            room.update_settings(settings, 51).unwrap_err().code,
            "invalid_settings",
            "expected reject for {label}"
        );
    }

    let mut edge_min = custom_settings();
    edge_min.rounds = MIN_ROUNDS;
    edge_min.draw_seconds = MIN_DRAW_SECONDS;
    edge_min.guess_seconds = MIN_GUESS_SECONDS;
    edge_min.vote_seconds = MIN_VOTE_SECONDS;
    edge_min.results_seconds = MIN_RESULTS_SECONDS;
    room.update_settings(edge_min.clone(), 52).unwrap();
    assert_eq!(room.settings, edge_min);

    let mut edge_max = custom_settings();
    edge_max.rounds = MAX_ROUNDS;
    edge_max.draw_seconds = MAX_DRAW_SECONDS;
    edge_max.guess_seconds = MAX_GUESS_SECONDS;
    edge_max.vote_seconds = MAX_VOTE_SECONDS;
    edge_max.results_seconds = MAX_RESULTS_SECONDS;
    edge_max.prompt_pack_id = format!("  {PARTY_CHAOS_PROMPT_PACK_ID}  ");
    room.update_settings(edge_max, 53).unwrap();
    assert_eq!(room.settings.rounds, MAX_ROUNDS);
    assert_eq!(room.settings.prompt_pack_id, PARTY_CHAOS_PROMPT_PACK_ID);
}
