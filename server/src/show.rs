use crate::protocol::{
    AwardKind, AwardWinner, GameAward, ResultPresentation, ScoreEntry, ScoreEvent, ScoreEventKind,
    VoteBreakdown,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub(crate) fn presentation(
    breakdown: &[VoteBreakdown],
    now_ms: u64,
    seconds: u64,
) -> (ResultPresentation, u64) {
    // Keep the first ballot option on ties, independent of names or map ordering.
    let mut spotlight: Option<&VoteBreakdown> = None;
    for option in breakdown {
        if !option.is_correct
            && !option.voter_names.is_empty()
            && spotlight.is_none_or(|best| option.voter_names.len() > best.voter_names.len())
        {
            spotlight = Some(option);
        }
    }
    let duration = seconds * 1000;
    let skipped = if spotlight.is_none() { duration / 5 } else { 0 };
    let at = |percent, skip| now_ms.saturating_add(duration * percent / 100 - skip);
    (
        ResultPresentation {
            started_at_ms: now_ms,
            tally_at_ms: at(4, 0),
            spotlight_at_ms: at(20, 0),
            truth_at_ms: at(40, skipped),
            scores_at_ms: at(65, skipped),
            continue_at_ms: at(90, skipped),
            spotlight_option_id: spotlight.map(|option| option.option_id.clone()),
        },
        at(100, skipped),
    )
}

/// Only aggregate scored events: no drawing history or extra scoring rules.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct AwardStats {
    bluff_points: u32,
    truths_found: u32,
    artist_correct_votes: u32,
}

pub(crate) fn record_awards(stats: &mut BTreeMap<String, AwardStats>, events: &[ScoreEvent]) {
    for event in events {
        if event.points <= 0 {
            continue;
        }
        let entry = stats.entry(event.player_id.clone()).or_default();
        match event.kind {
            ScoreEventKind::FooledPlayer => entry.bluff_points += event.points as u32,
            ScoreEventKind::FoundTruth => entry.truths_found += 1,
            ScoreEventKind::ArtistClarity => entry.artist_correct_votes += 1,
            ScoreEventKind::NobodyFoundIt | ScoreEventKind::PerfectTruth => {}
        }
    }
}

pub(crate) fn game_awards(
    stats: &BTreeMap<String, AwardStats>,
    scores: &[ScoreEntry],
) -> Vec<GameAward> {
    [
        AwardKind::MasterBluffer,
        AwardKind::TruthDetective,
        AwardKind::PicturePerfect,
    ]
    .into_iter()
    .filter_map(|kind| {
        let value_for = |id: &str| {
            stats.get(id).map_or(0, |entry| match kind {
                AwardKind::MasterBluffer => entry.bluff_points,
                AwardKind::TruthDetective => entry.truths_found,
                AwardKind::PicturePerfect => entry.artist_correct_votes,
            })
        };
        let value = scores
            .iter()
            .map(|score| value_for(&score.player_id))
            .max()?;
        if value == 0 {
            return None;
        }
        let winners = scores
            .iter()
            .filter(|score| value_for(&score.player_id) == value)
            .map(|score| AwardWinner {
                player_id: score.player_id.clone(),
                name: score.name.clone(),
            })
            .collect();
        Some(GameAward {
            kind,
            value,
            winners,
        })
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(id: &str, votes: usize, truth: bool) -> VoteBreakdown {
        VoteBreakdown {
            option_id: id.into(),
            option_text: id.into(),
            voter_names: (0..votes).map(|n| format!("Voter {n}")).collect(),
            is_correct: truth,
            author_name: (!truth).then(|| "Ava & Bo".into()),
        }
    }

    #[test]
    fn spotlight_uses_ballot_order_for_ties_and_never_spotlights_truth() {
        let ballot = [
            option("truth", 7, true),
            option("first", 2, false),
            option("second", 2, false),
        ];
        let (show, deadline) = presentation(&ballot, 1_000, 12);
        assert_eq!(show.spotlight_option_id.as_deref(), Some("first"));
        assert_eq!(deadline, 13_000);
        assert!(show.tally_at_ms < show.spotlight_at_ms && show.truth_at_ms < show.scores_at_ms);
        let (empty, shorter) = presentation(
            &[option("truth", 0, true), option("fake", 0, false)],
            1_000,
            12,
        );
        assert!(empty.spotlight_option_id.is_none());
        assert_eq!(shorter, 10_600);
    }

    #[test]
    fn shared_fakes_use_awarded_points_and_resolve_current_names() {
        let mut stats = BTreeMap::new();
        let events: Vec<_> = ["a", "b"]
            .into_iter()
            .map(|id| ScoreEvent {
                kind: ScoreEventKind::FooledPlayer,
                player_id: id.into(),
                name: "Old name".into(),
                points: 25,
                related_player_id: Some("c".into()),
                related_player_name: Some("Cy".into()),
            })
            .collect();
        record_awards(&mut stats, &events);
        let scores = [
            ScoreEntry {
                player_id: "a".into(),
                name: "Ava".into(),
                score: 25,
            },
            ScoreEntry {
                player_id: "b".into(),
                name: "Bo".into(),
                score: 25,
            },
        ];
        let awards = game_awards(&stats, &scores);
        assert_eq!(awards.len(), 1);
        assert_eq!(awards[0].value, 25);
        assert_eq!(awards[0].winners.len(), 2);
        assert_eq!(awards[0].winners[0].name, "Ava");
    }
}
