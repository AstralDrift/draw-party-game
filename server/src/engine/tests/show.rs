use super::super::*;
use super::helpers::*;
use crate::protocol::AwardKind;

#[test]
fn spotlight_is_authoritative_and_continue_waits_for_the_score_beat() {
    let mut room = room_with_players();
    let voters = reach_voting(&mut room, 100);
    let fake = fake_option_id_for(&room, &voters[1]);
    room.submit_vote(&voters[0], room.turn_token, fake.clone(), 400)
        .unwrap();
    room.submit_vote(&voters[1], room.turn_token, truth_option_id(&room), 401)
        .unwrap();
    let show = room.snapshot(402).result_presentation.unwrap();
    assert_eq!(show.spotlight_option_id.as_deref(), Some(fake.as_str()));
    assert_eq!(show.started_at_ms, 401);
    assert_eq!(room.deadline_ms, Some(14_401));
    let totals = room.final_scores();
    let stats = room.award_stats.clone();
    assert_eq!(
        room.handle_start_or_advance(show.continue_at_ms - 1)
            .unwrap_err()
            .code,
        "results_locked"
    );
    assert_eq!(room.phase, GamePhase::Results);
    room.mark_disconnected(&voters[0], 450);
    room.upsert_player(voters[0].clone(), "Reconnected".into(), 460)
        .unwrap();
    assert_eq!(room.snapshot(460).result_presentation, Some(show.clone()));
    assert_eq!(room.final_scores(), totals);
    assert_eq!(room.award_stats, stats);
    assert!(room.snapshot(460).game_awards.is_empty());
    room.handle_start_or_advance(show.continue_at_ms).unwrap();
    assert_eq!(room.phase, GamePhase::Guessing);
    assert!(room
        .snapshot(show.continue_at_ms)
        .result_presentation
        .is_none());
}

#[test]
fn all_correct_shortens_the_show_and_awards_ties_without_extra_points() {
    let mut room = room_with_players();
    room.settings.rounds = 1;
    reach_guessing(&mut room, 100);
    let mut now = 300;
    for _ in 0..3 {
        play_guesses_then_vote_truth(&mut room, now);
        let show = room.round.presentation.as_ref().unwrap();
        assert!(show.spotlight_option_id.is_none());
        assert_eq!(room.deadline_ms.unwrap() - show.started_at_ms, 11_200);
        assert_eq!(show.spotlight_at_ms, show.truth_at_ms);
        now = show.continue_at_ms;
        room.handle_start_or_advance(now).unwrap();
        now += 100;
    }
    let snapshot = room.snapshot(now);
    assert_eq!(room.phase, GamePhase::FinalScores);
    assert_eq!(snapshot.game_awards.len(), 2);
    assert_eq!(snapshot.game_awards[0].kind, AwardKind::TruthDetective);
    assert_eq!(snapshot.game_awards[1].kind, AwardKind::PicturePerfect);
    assert!(snapshot
        .game_awards
        .iter()
        .all(|award| award.value == 2 && award.winners.len() == 3));
    assert!(snapshot.final_scores.iter().all(|score| score.score == 650));
    room.handle_start_or_advance(room.deadline_ms.unwrap())
        .unwrap();
    assert!(room.award_stats.is_empty());
    assert!(room.snapshot(now).game_awards.is_empty());
    assert!(room.players.values().all(|player| player.score == 0));
}

#[test]
fn practice_never_earns_awards() {
    let mut room = room_with_players();
    room.mark_disconnected("p2", 10);
    room.mark_disconnected("p3", 10);
    room.handle_start_practice(100).unwrap();
    room.submit_drawing("p1", room.turn_token, drawing(), 200)
        .unwrap();
    assert_eq!(room.phase, GamePhase::Results);
    continue_after_show(&mut room);
    assert!(room.award_stats.is_empty());
    assert!(room.snapshot(300).game_awards.is_empty());
}
