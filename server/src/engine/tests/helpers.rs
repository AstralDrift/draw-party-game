use super::super::*;
use crate::protocol::DEFAULT_PROMPT_PACK_ID;
use std::collections::BTreeMap;

pub(super) fn drawing() -> DrawingDoc {
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

pub(super) fn empty_drawing() -> DrawingDoc {
    DrawingDoc {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        strokes: vec![],
    }
}

pub(super) fn stroke_with_points(points: Vec<Point>, color: &str, size: u8) -> Stroke {
    Stroke {
        color: color.to_string(),
        size,
        points,
    }
}

pub(super) fn drawing_with_strokes(strokes: Vec<Stroke>) -> DrawingDoc {
    DrawingDoc {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        strokes,
    }
}

pub(super) fn room_with_players() -> Room {
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

pub(super) fn custom_settings() -> RoomSettings {
    RoomSettings {
        rounds: 2,
        draw_seconds: 60,
        guess_seconds: 20,
        vote_seconds: 15,
        results_seconds: 10,
        prompt_pack_id: DEFAULT_PROMPT_PACK_ID.to_string(),
    }
}

pub(super) fn submit_all_drawings(room: &mut Room, now_ms: u64) {
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

pub(super) fn non_artist_ids(room: &Room) -> Vec<String> {
    let artist = room.round.current_artist_id.as_deref();
    room.players
        .values()
        .filter(|player| !player.spectator && artist != Some(player.id.as_str()))
        .map(|player| player.id.clone())
        .collect()
}

pub(super) fn truth_option_id(room: &Room) -> String {
    room.round
        .voting_options
        .iter()
        .find(|option| option.is_correct)
        .expect("truth option")
        .id
        .clone()
}

pub(super) fn fake_option_id_for(room: &Room, author_id: &str) -> String {
    room.round
        .voting_options
        .iter()
        .find(|option| option.author_player_id.as_deref() == Some(author_id))
        .expect("fake option for author")
        .id
        .clone()
}

pub(super) fn reach_guessing(room: &mut Room, now_ms: u64) {
    room.handle_start_or_advance(now_ms).unwrap();
    submit_all_drawings(room, now_ms + 100);
    assert_eq!(room.phase, GamePhase::Guessing);
}

pub(super) fn reach_voting(room: &mut Room, now_ms: u64) -> Vec<String> {
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

/// Submit unique fakes from every non-artist, then all vote for the truth option.
pub(super) fn play_guesses_then_vote_truth(room: &mut Room, now_ms: u64) {
    let voters = non_artist_ids(room);
    let guess_token = room.turn_token;
    for (index, voter) in voters.iter().enumerate() {
        room.submit_guess(voter, guess_token, format!("fake-{index}"), now_ms)
            .unwrap();
    }
    let vote_token = room.turn_token;
    let truth = truth_option_id(room);
    for voter in &voters {
        room.submit_vote(voter, vote_token, truth.clone(), now_ms + 100)
            .unwrap();
    }
    assert_eq!(room.phase, GamePhase::Results);
}

pub(super) fn deltas_map(room: &Room) -> BTreeMap<String, i32> {
    room.round
        .result
        .as_ref()
        .unwrap()
        .score_deltas
        .iter()
        .map(|delta| (delta.player_id.clone(), delta.delta))
        .collect()
}

pub(super) fn continue_after_show(room: &mut Room) {
    assert_eq!(room.phase, GamePhase::Results);
    let now_ms = room.round.presentation.as_ref().unwrap().continue_at_ms;
    room.handle_start_or_advance(now_ms).unwrap();
}
