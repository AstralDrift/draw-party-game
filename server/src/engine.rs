use crate::prompts::prompt_pack_prompts;
use crate::protocol::{
    DrawingDoc, GameMode, GamePhase, PlayerPublic, Point, ReactionBurst, ResultPresentation,
    RoomSettings, RoomSnapshot, RoundResult, ScoreDelta, ScoreEntry, ScoreEvent, ScoreEventKind,
    Stroke, VoteBreakdown, VotingOption, ALLOWED_REACTIONS, CANVAS_HEIGHT, CANVAS_WIDTH,
    DEADLINE_EXTENSION_SECONDS, MAX_DRAW_SECONDS, MAX_GUESS_LEN, MAX_GUESS_SECONDS, MAX_NAME_LEN,
    MAX_PLAYERS, MAX_POINTS_PER_STROKE, MAX_RESULTS_SECONDS, MAX_ROUNDS, MAX_STROKES,
    MAX_VOTE_SECONDS, MIN_DRAW_SECONDS, MIN_GUESS_SECONDS, MIN_PLAYERS, MIN_RESULTS_SECONDS,
    MIN_ROUNDS, MIN_VOTE_SECONDS, PRACTICE_PLAYERS, REACTION_COOLDOWN_MS, ROOM_TTL_MS,
};
use crate::show::{game_awards, presentation, record_awards, AwardStats};
use rand::{seq::SliceRandom, Rng};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use unicode_normalization::UnicodeNormalization;

const FINAL_SCORES_CELEBRATION_SECONDS: u64 = 3;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub score: i32,
    pub connected: bool,
    pub spectator: bool,
    #[serde(default)]
    pub joined_at_ms: u64,
    #[serde(default, skip)]
    pub last_reaction_ms: u64,
    #[serde(default, skip)]
    session_token: String,
    #[serde(default)]
    has_played: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoundState {
    pub prompts: BTreeMap<String, String>,
    pub drawings: BTreeMap<String, DrawingDoc>,
    pub order: Vec<String>,
    pub current_index: usize,
    pub current_artist_id: Option<String>,
    pub guesses: BTreeMap<String, String>,
    pub votes: BTreeMap<String, String>,
    pub voting_options: Vec<VotingOption>,
    pub result: Option<RoundResult>,
    #[serde(default)]
    pub presentation: Option<ResultPresentation>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct PendingDrawingRetry {
    prompt_pack_id: String,
    prompts: BTreeMap<String, String>,
    order: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingScoreEvent {
    kind: ScoreEventKind,
    player_id: String,
    points: i32,
    related_player_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Room {
    pub code: String,
    #[serde(skip)]
    pub host_token: String,
    pub phase: GamePhase,
    #[serde(default)]
    pub game_mode: GameMode,
    pub players: BTreeMap<String, Player>,
    #[serde(default)]
    pub host_player_id: Option<String>,
    pub displays: BTreeSet<String>,
    pub settings: RoomSettings,
    pub current_round: u8,
    pub turn_token: u64,
    pub deadline_ms: Option<u64>,
    #[serde(default)]
    deadline_extension_used: bool,
    pub round: RoundState,
    #[serde(default)]
    used_prompt_keys: BTreeSet<String>,
    #[serde(default)]
    pending_drawing_retry: Option<PendingDrawingRetry>,
    #[serde(default)]
    current_round_prompt_viewers: BTreeSet<String>,
    #[serde(default)]
    retired_scores: BTreeMap<String, ScoreEntry>,
    #[serde(default)]
    award_stats: BTreeMap<String, AwardStats>,
    pub created_at_ms: u64,
    pub last_active_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineEvent {
    Snapshot,
    PhaseChanged,
    PlayerListChanged,
    FinalScores,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError {
    pub code: &'static str,
    pub message: String,
}

impl EngineError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub type EngineResult<T> = Result<T, EngineError>;

impl Room {
    pub fn new(code: String, display_id: String, host_token: String, now_ms: u64) -> Self {
        let mut displays = BTreeSet::new();
        displays.insert(display_id);

        Self {
            code,
            host_token,
            phase: GamePhase::Lobby,
            game_mode: GameMode::Party,
            players: BTreeMap::new(),
            host_player_id: None,
            displays,
            settings: RoomSettings::default(),
            current_round: 0,
            turn_token: 0,
            deadline_ms: None,
            deadline_extension_used: false,
            round: RoundState::default(),
            used_prompt_keys: BTreeSet::new(),
            pending_drawing_retry: None,
            current_round_prompt_viewers: BTreeSet::new(),
            retired_scores: BTreeMap::new(),
            award_stats: BTreeMap::new(),
            created_at_ms: now_ms,
            last_active_ms: now_ms,
        }
    }

    pub fn touch(&mut self, now_ms: u64) {
        self.last_active_ms = now_ms;
    }

    pub fn add_display(&mut self, display_id: String, now_ms: u64) {
        self.touch(now_ms);
        self.displays.insert(display_id);
    }

    pub fn upsert_player(
        &mut self,
        player_id: String,
        name: String,
        now_ms: u64,
    ) -> EngineResult<()> {
        let session_token = self
            .players
            .get(&player_id)
            .map(|player| player.session_token.clone())
            .filter(|token| !token.is_empty())
            .unwrap_or_else(|| format!("legacy:{player_id}"));
        self.upsert_player_with_session(player_id, session_token, name, now_ms)
    }

    pub fn upsert_player_with_session(
        &mut self,
        player_id: String,
        session_token: String,
        name: String,
        now_ms: u64,
    ) -> EngineResult<()> {
        if self
            .players
            .get(&player_id)
            .is_some_and(|player| player.session_token != session_token)
        {
            return Err(EngineError::new(
                "invalid_player_session",
                "This player identity belongs to another device.",
            ));
        }

        self.touch(now_ms);
        if !self.players.contains_key(&player_id) && self.players.len() >= MAX_PLAYERS {
            self.make_room_for_pending_retry_player(&player_id);
        }
        let has_retry_assignment = self
            .pending_drawing_retry
            .as_ref()
            .is_some_and(|retry| retry.prompts.contains_key(&player_id));
        let joining_as_spectator = (self.phase != GamePhase::Lobby
            || self.pending_drawing_retry.is_some())
            && !self.players.contains_key(&player_id)
            && !has_retry_assignment;

        // Spectators consume MAX_PLAYERS seats (same roster cap as active players).
        if !self.players.contains_key(&player_id) && self.players.len() >= MAX_PLAYERS {
            return Err(EngineError::new(
                "room_full",
                format!("Rooms are capped at {MAX_PLAYERS} players."),
            ));
        }

        if let Some(player) = self.players.get_mut(&player_id) {
            // Reconnect is identity recovery, not an implicit rename. The canonical name only
            // changes through set_name, where collision handling can be applied deliberately.
            player.connected = true;
        } else {
            let restored_score = self.retired_scores.remove(&player_id);
            let requested_name = restored_score
                .as_ref()
                .map_or(name.as_str(), |entry| entry.name.as_str());
            let canonical_name = self.available_player_name(requested_name, None);
            self.players.insert(
                player_id.clone(),
                Player {
                    id: player_id,
                    name: canonical_name,
                    score: restored_score.as_ref().map_or(0, |entry| entry.score),
                    connected: true,
                    spectator: joining_as_spectator,
                    joined_at_ms: now_ms,
                    last_reaction_ms: 0,
                    session_token,
                    has_played: restored_score.is_some(),
                },
            );
        }
        self.ensure_host();
        self.rearm_quiescent_results_deadline(now_ms);

        Ok(())
    }

    fn make_room_for_pending_retry_player(&mut self, replacement_id: &str) {
        // Someone who has already seen a prompt this round cannot safely inherit another
        // player's prompt: they could identify the transferred truth during voting.
        if self.current_round_prompt_viewers.contains(replacement_id) {
            return;
        }
        let departed_id = self.pending_drawing_retry.as_ref().and_then(|retry| {
            retry.order.iter().find_map(|player_id| {
                self.players
                    .get(player_id)
                    .is_some_and(|player| !player.connected)
                    .then(|| player_id.clone())
            })
        });
        let Some(departed_id) = departed_id else {
            return;
        };
        let Some(departed) = self.players.remove(&departed_id) else {
            return;
        };
        let Some(retry) = self.pending_drawing_retry.as_mut() else {
            self.players.insert(departed_id, departed);
            return;
        };
        let Some(prompt) = retry.prompts.remove(&departed_id) else {
            self.players.insert(departed_id, departed);
            return;
        };

        retry.prompts.insert(replacement_id.to_string(), prompt);
        self.current_round_prompt_viewers
            .insert(replacement_id.to_string());
        if let Some(order_slot) = retry.order.iter_mut().find(|slot| **slot == departed_id) {
            *order_slot = replacement_id.to_string();
        }
        if departed.has_played {
            self.retired_scores.insert(
                departed.id.clone(),
                ScoreEntry {
                    player_id: departed.id,
                    name: departed.name,
                    score: departed.score,
                },
            );
        }
    }

    pub fn set_name(&mut self, player_id: &str, name: String, now_ms: u64) -> EngineResult<()> {
        self.touch(now_ms);
        if !self.players.contains_key(player_id) {
            return Err(EngineError::new(
                "not_joined",
                "Join the room before setting a name.",
            ));
        }
        let canonical_name = self.available_player_name(&name, Some(player_id));
        let player = self.players.get_mut(player_id).ok_or_else(|| {
            EngineError::new("not_joined", "Join the room before setting a name.")
        })?;
        player.name = canonical_name;
        Ok(())
    }

    fn available_player_name(
        &self,
        requested_name: &str,
        excluded_player_id: Option<&str>,
    ) -> String {
        let base = sanitize_name(requested_name);
        let reserved_names: BTreeSet<String> = self
            .players
            .values()
            .filter(|player| excluded_player_id != Some(player.id.as_str()))
            .map(|player| normalize_text(&player.name))
            .collect();
        if !reserved_names.contains(&normalize_text(&base)) {
            return base;
        }

        let mut number = 2_usize;
        loop {
            let suffix = format!(" {number}");
            let available_base_chars = MAX_NAME_LEN.saturating_sub(suffix.chars().count());
            let truncated_base: String = base.chars().take(available_base_chars).collect();
            let candidate = format!("{truncated_base}{suffix}");
            if !reserved_names.contains(&normalize_text(&candidate)) {
                return candidate;
            }
            number = number.saturating_add(1);
        }
    }

    pub fn update_settings(
        &mut self,
        settings: RoomSettings,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        self.touch(now_ms);
        if self.phase != GamePhase::Lobby {
            return Err(EngineError::new(
                "invalid_phase",
                "Room settings can only be changed in the lobby.",
            ));
        }

        let settings = normalize_room_settings(settings)?;
        let prompt_pack_changed_during_retry = self
            .pending_drawing_retry
            .as_ref()
            .is_some_and(|retry| retry.prompt_pack_id != settings.prompt_pack_id);
        if prompt_pack_changed_during_retry {
            self.abandon_pending_drawing_retry();
        }

        self.settings = settings;
        Ok(EngineEvent::Snapshot)
    }

    pub fn mark_disconnected(&mut self, client_id: &str, now_ms: u64) {
        self.touch(now_ms);
        self.displays.remove(client_id);
        if let Some(player) = self.players.get_mut(client_id) {
            player.connected = false;
        }
        self.ensure_host();
    }

    /// Sticky host while connected; otherwise earliest join among active phones, else any connected.
    pub fn ensure_host(&mut self) {
        if let Some(host_id) = self.host_player_id.as_deref() {
            if self
                .players
                .get(host_id)
                .is_some_and(|player| player.connected)
            {
                return;
            }
        }

        self.host_player_id = self.pick_next_host_id();
    }

    fn pick_next_host_id(&self) -> Option<String> {
        let earliest = |spectators_ok: bool| {
            self.players
                .values()
                .filter(|player| player.connected && (spectators_ok || !player.spectator))
                .min_by_key(|player| player.joined_at_ms)
                .map(|player| player.id.clone())
        };

        earliest(false).or_else(|| earliest(true))
    }

    pub fn player_can_control(&self, player_id: &str) -> bool {
        self.host_player_id.as_deref() == Some(player_id)
            && self
                .players
                .get(player_id)
                .is_some_and(|player| player.connected)
    }

    pub fn player_session_matches(&self, player_id: &str, session_token: &str) -> bool {
        self.players
            .get(player_id)
            .is_none_or(|player| player.session_token == session_token)
    }

    pub fn handle_start_or_advance(&mut self, now_ms: u64) -> EngineResult<EngineEvent> {
        self.touch(now_ms);
        match self.phase {
            GamePhase::Lobby => {
                self.start_drawing_round(now_ms, Some(GameMode::Party))?;
                Ok(EngineEvent::PhaseChanged)
            }
            GamePhase::FinalScores => {
                self.ensure_final_scores_unlocked(now_ms)?;
                self.start_drawing_round(now_ms, Some(GameMode::Party))?;
                Ok(EngineEvent::PhaseChanged)
            }
            GamePhase::Results => {
                if self
                    .round
                    .presentation
                    .as_ref()
                    .is_some_and(|show| now_ms < show.continue_at_ms)
                {
                    return Err(EngineError::new(
                        "results_locked",
                        "Let the reveal land before continuing.",
                    ));
                }
                if self.advance_after_results(now_ms)? {
                    Ok(EngineEvent::FinalScores)
                } else {
                    Ok(EngineEvent::PhaseChanged)
                }
            }
            _ => Err(EngineError::new(
                "invalid_phase",
                "The game can only be started or advanced from lobby, results, or final scores.",
            )),
        }
    }

    pub fn handle_start_practice(&mut self, now_ms: u64) -> EngineResult<EngineEvent> {
        self.touch(now_ms);
        match self.phase {
            GamePhase::Lobby => {
                self.start_drawing_round(now_ms, Some(GameMode::Practice))?;
                Ok(EngineEvent::PhaseChanged)
            }
            GamePhase::FinalScores => {
                self.ensure_final_scores_unlocked(now_ms)?;
                self.start_drawing_round(now_ms, Some(GameMode::Practice))?;
                Ok(EngineEvent::PhaseChanged)
            }
            GamePhase::Drawing | GamePhase::Guessing | GamePhase::Voting | GamePhase::Results => {
                Err(EngineError::new(
                    "invalid_phase",
                    "Practice can only be started from the lobby or final scores.",
                ))
            }
        }
    }

    pub fn extend_deadline(&mut self, turn_token: u64, now_ms: u64) -> EngineResult<EngineEvent> {
        self.ensure_turn_token(turn_token)?;
        match self.phase {
            GamePhase::Drawing | GamePhase::Guessing | GamePhase::Voting => {}
            GamePhase::Lobby | GamePhase::Results | GamePhase::FinalScores => {
                return Err(EngineError::new(
                    "invalid_phase",
                    "Only an active drawing, guessing, or voting timer can be extended.",
                ));
            }
        }
        let Some(deadline_ms) = self.deadline_ms else {
            return Err(EngineError::new(
                "missing_deadline",
                "This turn does not have an active deadline.",
            ));
        };
        if now_ms >= deadline_ms {
            return Err(EngineError::new(
                "deadline_expired",
                "Time is already up for this turn.",
            ));
        }
        if self.deadline_extension_used {
            return Err(EngineError::new(
                "deadline_extension_used",
                "This turn has already received extra time.",
            ));
        }

        self.touch(now_ms);
        self.deadline_ms = Some(deadline_after(deadline_ms, DEADLINE_EXTENSION_SECONDS));
        self.deadline_extension_used = true;
        Ok(EngineEvent::Snapshot)
    }

    pub fn submit_drawing(
        &mut self,
        player_id: &str,
        turn_token: u64,
        drawing: DrawingDoc,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        if self.phase != GamePhase::Drawing {
            return Err(EngineError::new(
                "invalid_phase",
                "Drawings are only accepted during drawing.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
        self.ensure_submission_before_deadline(now_ms)?;
        self.touch(now_ms);
        self.ensure_active_player(player_id, "Only connected players can submit drawings.")?;
        if !self.round.prompts.contains_key(player_id) {
            return Err(EngineError::new(
                "not_round_player",
                "You rejoined after prompts were assigned. Watch this drawing round, then play the next one.",
            ));
        }
        validate_drawing(&drawing)?;
        if self.round.drawings.contains_key(player_id) {
            return Err(EngineError::new(
                "duplicate_submission",
                "Drawing already submitted.",
            ));
        }

        self.round.drawings.insert(player_id.to_string(), drawing);
        Ok(self
            .advance_if_ready(now_ms)?
            .unwrap_or(EngineEvent::Snapshot))
    }

    pub fn submit_guess(
        &mut self,
        player_id: &str,
        turn_token: u64,
        guess: String,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        if self.phase != GamePhase::Guessing {
            return Err(EngineError::new(
                "invalid_phase",
                "Guesses are only accepted during guessing.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
        self.ensure_submission_before_deadline(now_ms)?;
        self.touch(now_ms);
        self.ensure_active_non_artist(player_id)?;
        if self.round.guesses.contains_key(player_id) {
            return Err(EngineError::new(
                "duplicate_submission",
                "Guess already submitted.",
            ));
        }

        let guess = sanitize_guess(&guess)?;
        self.round.guesses.insert(player_id.to_string(), guess);
        Ok(self
            .advance_if_ready(now_ms)?
            .unwrap_or(EngineEvent::Snapshot))
    }

    pub fn submit_vote(
        &mut self,
        player_id: &str,
        turn_token: u64,
        option_id: String,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        if self.phase != GamePhase::Voting {
            return Err(EngineError::new(
                "invalid_phase",
                "Votes are only accepted during voting.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
        self.ensure_submission_before_deadline(now_ms)?;
        self.touch(now_ms);
        self.ensure_active_non_artist(player_id)?;
        if self.round.votes.contains_key(player_id) {
            return Err(EngineError::new(
                "duplicate_submission",
                "Vote already submitted.",
            ));
        }

        let option = self
            .round
            .voting_options
            .iter()
            .find(|candidate| candidate.id == option_id)
            .ok_or_else(|| {
                EngineError::new("invalid_vote", "That voting option is not available.")
            })?;

        if self
            .fake_author_ids_for_option(option)
            .iter()
            .any(|author_id| author_id == player_id)
        {
            return Err(EngineError::new(
                "own_guess",
                "Players cannot vote for their own fake answer.",
            ));
        }

        self.round.votes.insert(player_id.to_string(), option_id);
        Ok(self
            .advance_if_ready(now_ms)?
            .unwrap_or(EngineEvent::Snapshot))
    }

    pub fn advance_if_ready(&mut self, now_ms: u64) -> EngineResult<Option<EngineEvent>> {
        let mut advanced = false;
        loop {
            match self.phase {
                GamePhase::Drawing if self.connected_drawers_done() => {
                    self.touch(now_ms);
                    self.begin_guessing(now_ms)?;
                    advanced = true;
                }
                GamePhase::Guessing if self.connected_guessers_done() => {
                    self.touch(now_ms);
                    self.begin_voting(now_ms)?;
                    advanced = true;
                }
                GamePhase::Voting if self.connected_voters_done() => {
                    self.touch(now_ms);
                    self.finish_voting(now_ms)?;
                    advanced = true;
                }
                _ => break,
            }
        }

        Ok(advanced.then_some(EngineEvent::PhaseChanged))
    }

    pub fn advance_if_expired(&mut self, now_ms: u64) -> EngineResult<Option<EngineEvent>> {
        let Some(deadline_ms) = self.deadline_ms else {
            return Ok(None);
        };
        if now_ms < deadline_ms {
            return Ok(None);
        }

        let event = match self.phase {
            GamePhase::Drawing => {
                if self.round.drawings.is_empty() {
                    self.reset_to_lobby_after_empty_drawing_timeout();
                } else {
                    self.begin_guessing(now_ms)?;
                }
                Ok(Some(EngineEvent::PhaseChanged))
            }
            GamePhase::Guessing => {
                self.begin_voting(now_ms)?;
                Ok(Some(EngineEvent::PhaseChanged))
            }
            GamePhase::Voting => {
                self.finish_voting(now_ms)?;
                Ok(Some(EngineEvent::PhaseChanged))
            }
            GamePhase::Results => {
                match self.advance_after_results(now_ms) {
                    Ok(true) => Ok(Some(EngineEvent::FinalScores)),
                    Ok(false) => Ok(Some(EngineEvent::PhaseChanged)),
                    Err(error)
                        if error.code == "not_enough_players"
                            && self.players.values().all(|player| !player.connected) =>
                    {
                        // No participant can make this transition succeed. Clear the expired
                        // deadline so maintenance stays quiet; a returning player re-arms it.
                        self.deadline_ms = None;
                        Ok(None)
                    }
                    Err(error) => Err(error),
                }
            }
            _ => Ok(None),
        };
        if let Ok(Some(_)) = &event {
            self.touch(now_ms);
        }
        event
    }

    pub fn submit_reaction(
        &mut self,
        player_id: &str,
        emoji: &str,
        now_ms: u64,
    ) -> EngineResult<Option<ReactionBurst>> {
        self.touch(now_ms);
        if !matches!(
            self.phase,
            GamePhase::Guessing | GamePhase::Voting | GamePhase::Results
        ) {
            return Ok(None);
        }
        if !is_allowed_reaction(emoji) {
            return Err(EngineError::new(
                "invalid_reaction",
                "That reaction is not available.",
            ));
        }
        let player = self
            .players
            .get_mut(player_id)
            .ok_or_else(|| EngineError::new("not_joined", "Join the room before reacting."))?;
        if !player.connected {
            return Ok(None);
        }
        // `last_reaction_ms == 0` means never reacted; do not treat epoch as a prior reaction.
        if player.last_reaction_ms > 0
            && now_ms.saturating_sub(player.last_reaction_ms) < REACTION_COOLDOWN_MS
        {
            return Ok(None);
        }
        player.last_reaction_ms = now_ms;
        let name = player.name.clone();
        Ok(Some(ReactionBurst {
            player_id: player_id.to_string(),
            name,
            emoji: emoji.to_string(),
            at_ms: now_ms,
        }))
    }

    pub fn is_expired(&self, now_ms: u64) -> bool {
        self.displays.is_empty()
            && self.players.values().all(|player| !player.connected)
            && now_ms.saturating_sub(self.last_active_ms) > ROOM_TTL_MS
    }

    pub fn snapshot(&self, server_now_ms: u64) -> RoomSnapshot {
        let current_artist_id = self.round.current_artist_id.clone();
        let current_artist_name = current_artist_id
            .as_deref()
            .and_then(|id| self.players.get(id))
            .map(|player| player.name.clone());
        let current_drawing = current_artist_id
            .as_ref()
            .and_then(|id| self.round.drawings.get(id))
            .cloned();

        let voting_options = if self.phase == GamePhase::Voting {
            self.round
                .voting_options
                .iter()
                .map(|option| VotingOption {
                    id: option.id.clone(),
                    text: option.text.clone(),
                    author_player_id: None,
                    author_name: None,
                    is_correct: false,
                })
                .collect()
        } else {
            self.round.voting_options.clone()
        };

        RoomSnapshot {
            room_code: self.code.clone(),
            phase: self.phase.clone(),
            game_mode: self.game_mode,
            players: self.public_players(),
            min_players: MIN_PLAYERS,
            max_players: MAX_PLAYERS,
            settings: self.settings.clone(),
            server_now_ms,
            current_round: self.current_round,
            total_rounds: self.total_rounds(),
            turn_token: self.turn_token,
            deadline_ms: self.deadline_ms,
            deadline_extension_available: self.deadline_extension_available(server_now_ms),
            current_artist_id,
            current_artist_name,
            current_drawing,
            voting_options,
            nailed_it: false,
            round_result: self.round.result.clone(),
            result_presentation: (self.phase == GamePhase::Results)
                .then(|| self.round.presentation.clone())
                .flatten(),
            game_awards: if self.phase == GamePhase::FinalScores
                && self.game_mode == GameMode::Party
            {
                game_awards(&self.award_stats, &self.final_scores())
            } else {
                Vec::new()
            },
            final_scores: self.final_scores(),
            drawing_submitted_ids: self.round.drawings.keys().cloned().collect(),
            guess_submitted_ids: self.round.guesses.keys().cloned().collect(),
            vote_submitted_ids: self.round.votes.keys().cloned().collect(),
        }
    }

    pub fn prompt_for_player(&self, player_id: &str) -> Option<String> {
        self.round.prompts.get(player_id).cloned()
    }

    pub fn player_nailed_it(&self, player_id: &str) -> bool {
        if self.phase != GamePhase::Voting {
            return false;
        }
        let Some(artist_id) = self.round.current_artist_id.as_deref() else {
            return false;
        };
        let Some(correct_answer) = self.round.prompts.get(artist_id) else {
            return false;
        };
        let Some(guess) = self.round.guesses.get(player_id) else {
            return false;
        };
        let Some(option_id) = self.round.votes.get(player_id) else {
            return false;
        };
        normalize_text(guess) == normalize_text(correct_answer)
            && self
                .round
                .voting_options
                .iter()
                .any(|option| option.id == *option_id && option.is_correct)
    }

    pub fn player_authored_voting_option(&self, player_id: &str, option_id: &str) -> bool {
        self.round
            .voting_options
            .iter()
            .find(|option| option.id == option_id)
            .is_some_and(|option| {
                self.fake_author_ids_for_option(option)
                    .iter()
                    .any(|author_id| author_id == player_id)
            })
    }

    fn start_drawing_round(
        &mut self,
        now_ms: u64,
        requested_mode: Option<GameMode>,
    ) -> EngineResult<()> {
        let abandoning_retry_for_new_mode = self.phase == GamePhase::Lobby
            && self.pending_drawing_retry.is_some()
            && requested_mode.is_some_and(|mode| mode != self.game_mode);
        if self.phase == GamePhase::Lobby
            && self.pending_drawing_retry.is_some()
            && !abandoning_retry_for_new_mode
        {
            return self.resume_pending_drawing_round(now_ms);
        }

        let next_mode = requested_mode.unwrap_or(self.game_mode);
        let prompt_pack = prompt_pack_prompts(&self.settings.prompt_pack_id).ok_or_else(|| {
            EngineError::new("invalid_prompt_pack", "That prompt pack is not available.")
        })?;
        let connected_count = self
            .players
            .values()
            .filter(|player| player.connected)
            .count();
        match requested_mode {
            Some(GameMode::Party) if connected_count < MIN_PLAYERS => {
                return Err(EngineError::new(
                    "not_enough_players",
                    format!("Need at least {MIN_PLAYERS} players to start Party mode."),
                ));
            }
            Some(GameMode::Practice) if connected_count != PRACTICE_PLAYERS => {
                return Err(EngineError::new(
                    "practice_requires_one_player",
                    "Practice mode requires exactly one connected phone.",
                ));
            }
            None if connected_count < PRACTICE_PLAYERS => {
                return Err(EngineError::new(
                    "not_enough_players",
                    "Need at least one connected player to continue.",
                ));
            }
            Some(GameMode::Party) | Some(GameMode::Practice) | None => {}
        }
        if prompt_pack.len() < connected_count {
            return Err(EngineError::new(
                "prompt_pack_exhausted",
                "The selected prompt pack cannot supply a unique prompt for every player.",
            ));
        }
        let mut available_prompts: Vec<&str> = prompt_pack
            .iter()
            .copied()
            .filter(|prompt| !self.used_prompt_keys.contains(&normalize_text(prompt)))
            .collect();
        if available_prompts.len() < connected_count {
            self.used_prompt_keys.clear();
            available_prompts = prompt_pack.to_vec();
        }

        if abandoning_retry_for_new_mode {
            // Switching modes explicitly starts a fresh game. Keep prompt history so phones do
            // not immediately receive prompts seen during the abandoned blank drawing round.
            self.abandon_pending_drawing_retry();
        }

        if self.phase == GamePhase::Results {
            // Keep the game roster, scores, and reconnect credentials stable between rounds.
            // Party mode promotes connected late-join spectators. Practice mode preserves
            // spectator status. Disconnected players sit this whole round out even if they
            // reconnect, then return on the next drawing round.
            for player in self.players.values_mut() {
                player.spectator = match next_mode {
                    GameMode::Party => !player.connected,
                    GameMode::Practice => player.spectator || !player.connected,
                };
            }
        } else {
            // A lobby start or Play Again begins a fresh game with the phones currently present.
            self.players.retain(|_, player| player.connected);
            self.promote_spectators();
        }

        if self.current_round == 0 || self.phase == GamePhase::FinalScores {
            self.current_round = 1;
            self.retired_scores.clear();
            self.award_stats.clear();
            for player in self.players.values_mut() {
                player.score = 0;
                player.has_played = false;
            }
        } else {
            self.current_round = self.current_round.saturating_add(1);
        }

        self.game_mode = next_mode;
        self.phase = GamePhase::Drawing;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.draw_seconds));
        self.deadline_extension_used = false;
        self.round = RoundState::default();

        let mut player_ids: Vec<String> = self
            .active_players()
            .map(|player| player.id.clone())
            .collect();
        let mut rng = rand::thread_rng();
        player_ids.shuffle(&mut rng);
        self.round.order = player_ids.clone();
        self.current_round_prompt_viewers = player_ids.iter().cloned().collect();

        available_prompts.shuffle(&mut rng);
        for (player_id, prompt) in player_ids.iter().zip(available_prompts) {
            let prompt = prompt.to_string();
            self.used_prompt_keys.insert(normalize_text(&prompt));
            self.round.prompts.insert(player_id.clone(), prompt);
            if let Some(player) = self.players.get_mut(player_id) {
                player.has_played = true;
            }
        }

        Ok(())
    }

    fn resume_pending_drawing_round(&mut self, now_ms: u64) -> EngineResult<()> {
        let retry = self
            .pending_drawing_retry
            .as_ref()
            .ok_or_else(|| EngineError::new("missing_retry", "No drawing round is waiting."))?;
        let connected_assigned_count = retry
            .prompts
            .keys()
            .filter(|player_id| {
                self.players
                    .get(*player_id)
                    .is_some_and(|player| player.connected)
            })
            .count();
        let disconnected_assignments: Vec<String> = retry
            .order
            .iter()
            .filter(|player_id| {
                !self
                    .players
                    .get(*player_id)
                    .is_some_and(|player| player.connected)
            })
            .cloned()
            .collect();
        let mut connected_replacements: Vec<(u64, String)> = self
            .players
            .values()
            .filter(|player| {
                player.connected
                    && !retry.prompts.contains_key(&player.id)
                    && !self.current_round_prompt_viewers.contains(&player.id)
            })
            .map(|player| (player.joined_at_ms, player.id.clone()))
            .collect();
        connected_replacements.sort();
        let replacement_count = disconnected_assignments
            .len()
            .min(connected_replacements.len());
        if connected_assigned_count + replacement_count < PRACTICE_PLAYERS {
            return Err(EngineError::new(
                "not_enough_players",
                "At least one player needs to reconnect or join before retrying this round.",
            ));
        }

        let mut retry = self
            .pending_drawing_retry
            .take()
            .ok_or_else(|| EngineError::new("missing_retry", "No drawing round is waiting."))?;
        for (departed_id, (_, replacement_id)) in disconnected_assignments
            .into_iter()
            .zip(connected_replacements)
        {
            let Some(prompt) = retry.prompts.remove(&departed_id) else {
                continue;
            };
            retry.prompts.insert(replacement_id.clone(), prompt);
            self.current_round_prompt_viewers
                .insert(replacement_id.clone());
            if let Some(order_slot) = retry.order.iter_mut().find(|slot| **slot == departed_id) {
                *order_slot = replacement_id.clone();
            }
            if let Some(departed) = self.players.get_mut(&departed_id) {
                departed.spectator = true;
            }
            if let Some(replacement) = self.players.get_mut(&replacement_id) {
                replacement.spectator = false;
            }
        }
        self.phase = GamePhase::Drawing;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.draw_seconds));
        self.deadline_extension_used = false;
        self.round = RoundState {
            prompts: retry.prompts,
            order: retry.order,
            ..RoundState::default()
        };
        for player_id in self.round.prompts.keys() {
            if let Some(player) = self.players.get_mut(player_id) {
                player.has_played = true;
            }
        }
        Ok(())
    }

    fn begin_guessing(&mut self, now_ms: u64) -> EngineResult<()> {
        let next_artist = self.next_artist_with_drawing();
        let Some(artist_id) = next_artist else {
            return Err(EngineError::new(
                "no_drawings",
                "No drawings were submitted before the timer ended.",
            ));
        };

        self.phase = GamePhase::Guessing;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.guess_seconds));
        self.deadline_extension_used = false;
        self.round.current_artist_id = Some(artist_id);
        self.round.guesses.clear();
        self.round.votes.clear();
        self.round.voting_options.clear();
        self.round.result = None;
        Ok(())
    }

    fn begin_voting(&mut self, now_ms: u64) -> EngineResult<()> {
        let artist_id = self
            .round
            .current_artist_id
            .clone()
            .ok_or_else(|| EngineError::new("missing_artist", "No drawing is active."))?;
        let correct_answer = self
            .round
            .prompts
            .get(&artist_id)
            .cloned()
            .ok_or_else(|| EngineError::new("missing_prompt", "No prompt is active."))?;

        let normalized_correct_answer = normalize_text(&correct_answer);
        let mut options = vec![VotingOption {
            id: String::new(),
            text: correct_answer,
            author_player_id: None,
            author_name: None,
            is_correct: true,
        }];
        let mut nailed_it_player_ids = Vec::new();
        let mut fake_groups: BTreeMap<String, (String, Vec<String>)> = BTreeMap::new();

        for (player_id, guess) in &self.round.guesses {
            let normalized_guess = normalize_text(guess);
            if normalized_guess == normalized_correct_answer {
                nailed_it_player_ids.push(player_id.clone());
                continue;
            }
            fake_groups
                .entry(normalized_guess)
                .or_insert_with(|| (guess.clone(), Vec::new()))
                .1
                .push(player_id.clone());
        }

        for (_, (guess, author_ids)) in fake_groups {
            let primary_author_id = author_ids.first().cloned().ok_or_else(|| {
                EngineError::new("missing_author", "A fake answer has no author.")
            })?;
            let author_name = self
                .players
                .get(&primary_author_id)
                .map(|player| player.name.clone());
            options.push(VotingOption {
                id: String::new(),
                text: guess,
                author_player_id: Some(primary_author_id),
                author_name,
                is_correct: false,
            });
        }

        options.shuffle(&mut rand::thread_rng());
        for (index, option) in options.iter_mut().enumerate() {
            option.id = format!("option-{index}");
        }
        self.round.voting_options = options;
        self.round.votes.clear();
        let correct_option_id = self
            .round
            .voting_options
            .iter()
            .find(|option| option.is_correct)
            .map(|option| option.id.clone())
            .ok_or_else(|| EngineError::new("missing_truth", "No correct voting option exists."))?;
        for player_id in nailed_it_player_ids {
            self.round
                .votes
                .insert(player_id, correct_option_id.clone());
        }
        if self.round.voting_options.len() < 2 {
            self.finish_voting(now_ms)?;
            return Ok(());
        }
        self.phase = GamePhase::Voting;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.vote_seconds));
        self.deadline_extension_used = false;
        Ok(())
    }

    fn finish_voting(&mut self, now_ms: u64) -> EngineResult<()> {
        let artist_id = self
            .round
            .current_artist_id
            .clone()
            .ok_or_else(|| EngineError::new("missing_artist", "No drawing is active."))?;
        let correct_answer = self
            .round
            .prompts
            .get(&artist_id)
            .cloned()
            .ok_or_else(|| EngineError::new("missing_prompt", "No prompt is active."))?;

        let mut breakdown_by_option: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut correct_voter_names = Vec::new();
        let mut pending_score_events = Vec::new();

        for (voter_id, option_id) in &self.round.votes {
            let voter_name = self
                .players
                .get(voter_id)
                .map(|player| player.name.clone())
                .unwrap_or_else(|| "Unknown".to_string());
            breakdown_by_option
                .entry(option_id.clone())
                .or_default()
                .push(voter_name.clone());

            let Some(option) = self
                .round
                .voting_options
                .iter()
                .find(|item| item.id == *option_id)
            else {
                continue;
            };

            if option.is_correct {
                correct_voter_names.push(voter_name);
                if self.game_mode == GameMode::Party {
                    pending_score_events.push(PendingScoreEvent {
                        kind: ScoreEventKind::FoundTruth,
                        player_id: voter_id.clone(),
                        points: 200,
                        related_player_id: Some(artist_id.clone()),
                    });
                    pending_score_events.push(PendingScoreEvent {
                        kind: ScoreEventKind::ArtistClarity,
                        player_id: artist_id.clone(),
                        points: 100,
                        related_player_id: Some(voter_id.clone()),
                    });
                }
            } else if self.game_mode == GameMode::Party {
                let author_ids = self.fake_author_ids_for_option(option);
                let author_count = author_ids.len();
                if author_count > 0 {
                    let base_points = 50 / author_count as i32;
                    let remainder = 50_usize % author_count;
                    for (index, author_id) in author_ids.into_iter().enumerate() {
                        let points = base_points + if index < remainder { 1 } else { 0 };
                        pending_score_events.push(PendingScoreEvent {
                            kind: ScoreEventKind::FooledPlayer,
                            player_id: author_id,
                            points,
                            related_player_id: Some(voter_id.clone()),
                        });
                    }
                }
            }
        }

        let eligible_voter_ids: Vec<String> = self
            .round
            .prompts
            .keys()
            .filter(|player_id| **player_id != artist_id)
            .filter(|player_id| {
                self.round.votes.contains_key(*player_id)
                    || self
                        .players
                        .get(*player_id)
                        .is_some_and(|player| player.connected)
            })
            .cloned()
            .collect();
        let nobody_found_it = !self.round.votes.is_empty()
            && correct_voter_names.is_empty()
            && !eligible_voter_ids.is_empty();
        let perfect_truth = !eligible_voter_ids.is_empty()
            && eligible_voter_ids.iter().all(|voter_id| {
                self.round.votes.get(voter_id).is_some_and(|option_id| {
                    self.round
                        .voting_options
                        .iter()
                        .any(|option| option.id == *option_id && option.is_correct)
                })
            });

        if nobody_found_it && self.game_mode == GameMode::Party {
            pending_score_events.push(PendingScoreEvent {
                kind: ScoreEventKind::NobodyFoundIt,
                player_id: artist_id.clone(),
                points: 50,
                related_player_id: None,
            });
        }
        if perfect_truth && self.game_mode == GameMode::Party {
            for voter_id in &eligible_voter_ids {
                pending_score_events.push(PendingScoreEvent {
                    kind: ScoreEventKind::PerfectTruth,
                    player_id: artist_id.clone(),
                    points: 25,
                    related_player_id: Some(voter_id.clone()),
                });
            }
        }

        let (score_delta_by_player, score_events) =
            apply_score_events(&mut self.players, &pending_score_events);

        record_awards(&mut self.award_stats, &score_events);
        let breakdown: Vec<VoteBreakdown> = self
            .round
            .voting_options
            .iter()
            .map(|option| VoteBreakdown {
                option_id: option.id.clone(),
                option_text: option.text.clone(),
                voter_names: breakdown_by_option.remove(&option.id).unwrap_or_default(),
                is_correct: option.is_correct,
                author_name: (!option.is_correct).then(|| {
                    self.fake_author_ids_for_option(option)
                        .into_iter()
                        .filter_map(|player_id| {
                            self.players
                                .get(&player_id)
                                .map(|player| player.name.clone())
                        })
                        .collect::<Vec<_>>()
                        .join(" & ")
                }),
            })
            .collect();

        let artist_name = self
            .players
            .get(&artist_id)
            .map(|player| player.name.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        let score_deltas = self
            .players
            .values()
            .map(|player| ScoreDelta {
                player_id: player.id.clone(),
                name: player.name.clone(),
                delta: score_delta_by_player
                    .get(&player.id)
                    .copied()
                    .unwrap_or_default(),
                score_after: player.score,
            })
            .collect();

        let (show, deadline) = presentation(&breakdown, now_ms, self.settings.results_seconds);
        self.round.presentation = Some(show);
        self.round.result = Some(RoundResult {
            artist_id,
            artist_name,
            correct_answer,
            correct_voter_names,
            breakdown,
            score_deltas,
            score_events,
            nobody_found_it,
            perfect_truth,
        });
        self.phase = GamePhase::Results;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline);
        self.deadline_extension_used = false;
        Ok(())
    }

    fn reset_to_lobby_after_empty_drawing_timeout(&mut self) {
        self.pending_drawing_retry = Some(PendingDrawingRetry {
            prompt_pack_id: self.settings.prompt_pack_id.clone(),
            prompts: std::mem::take(&mut self.round.prompts),
            order: std::mem::take(&mut self.round.order),
        });
        self.phase = GamePhase::Lobby;
        self.deadline_ms = None;
        self.deadline_extension_used = false;
        self.turn_token = self.turn_token.saturating_add(1);
        self.round = RoundState::default();
    }

    fn abandon_pending_drawing_retry(&mut self) {
        self.pending_drawing_retry = None;
        self.current_round = 0;
        self.current_round_prompt_viewers.clear();
        // The hidden retry made new arrivals spectators so they could not join its preserved
        // assignment. Once that assignment is abandoned, this is a fresh lobby again and every
        // connected phone must count toward Party / Practice readiness.
        self.promote_spectators();
    }

    fn advance_after_results(&mut self, now_ms: u64) -> EngineResult<bool> {
        if self.has_next_artist_with_drawing() {
            self.begin_guessing(now_ms)?;
            return Ok(false);
        }

        if self.current_round >= self.total_rounds() {
            self.phase = GamePhase::FinalScores;
            self.deadline_ms = Some(deadline_after(now_ms, FINAL_SCORES_CELEBRATION_SECONDS));
            self.deadline_extension_used = false;
            return Ok(true);
        }

        self.start_drawing_round(now_ms, None)?;
        Ok(false)
    }

    fn rearm_quiescent_results_deadline(&mut self, now_ms: u64) {
        if self.phase == GamePhase::Results && self.deadline_ms.is_none() {
            self.deadline_ms = Some(now_ms);
        }
    }

    fn next_artist_with_drawing(&mut self) -> Option<String> {
        while self.round.current_index < self.round.order.len() {
            let candidate = self.round.order[self.round.current_index].clone();
            self.round.current_index += 1;
            if self.round.drawings.contains_key(&candidate) {
                return Some(candidate);
            }
        }
        None
    }

    fn has_next_artist_with_drawing(&self) -> bool {
        self.round
            .order
            .iter()
            .skip(self.round.current_index)
            .any(|candidate| self.round.drawings.contains_key(candidate))
    }

    fn promote_spectators(&mut self) {
        for player in self.players.values_mut() {
            player.spectator = false;
        }
    }

    fn ensure_active_non_artist(&self, player_id: &str) -> EngineResult<()> {
        self.ensure_active_player(player_id, "Only connected players can submit.")?;
        if !self.round.prompts.contains_key(player_id) {
            return Err(EngineError::new(
                "not_round_player",
                "Watch this round, then join the next drawing round.",
            ));
        }
        if self.round.current_artist_id.as_deref() == Some(player_id) {
            return Err(EngineError::new(
                "artist_action",
                "The artist skips this step.",
            ));
        }
        Ok(())
    }

    fn ensure_active_player(
        &self,
        player_id: &str,
        disconnected_message: &str,
    ) -> EngineResult<()> {
        self.ensure_connected_player(player_id, disconnected_message)?;
        let player = self.players.get(player_id).expect("checked above");
        if player.spectator {
            return Err(EngineError::new(
                "spectator",
                "Spectators can watch but cannot submit.",
            ));
        }
        Ok(())
    }

    fn ensure_connected_player(
        &self,
        player_id: &str,
        disconnected_message: &str,
    ) -> EngineResult<()> {
        let Some(player) = self.players.get(player_id) else {
            return Err(EngineError::new(
                "not_joined",
                "Only joined players can submit.",
            ));
        };
        if !player.connected {
            return Err(EngineError::new("not_connected", disconnected_message));
        }
        Ok(())
    }

    fn ensure_turn_token(&self, turn_token: u64) -> EngineResult<()> {
        if self.turn_token != turn_token {
            return Err(EngineError::new(
                "stale_turn",
                "That submission belongs to an old turn.",
            ));
        }
        Ok(())
    }

    fn ensure_submission_before_deadline(&self, now_ms: u64) -> EngineResult<()> {
        if self
            .deadline_ms
            .is_some_and(|deadline_ms| now_ms >= deadline_ms)
        {
            return Err(EngineError::new(
                "deadline_expired",
                "Time is up for this turn. Wait for the next action.",
            ));
        }
        Ok(())
    }

    fn fake_author_ids_for_option(&self, option: &VotingOption) -> Vec<String> {
        if option.is_correct {
            return Vec::new();
        }
        let normalized_option = normalize_text(&option.text);
        self.round
            .guesses
            .iter()
            .filter(|(_, guess)| normalize_text(guess) == normalized_option)
            .map(|(player_id, _)| player_id.clone())
            .collect()
    }

    fn eligible_voter_count(&self) -> usize {
        self.active_players()
            .filter(|player| self.round.prompts.contains_key(&player.id))
            .filter(|player| self.round.current_artist_id.as_deref() != Some(player.id.as_str()))
            .count()
    }

    fn connected_drawers_done(&self) -> bool {
        let drawers: Vec<&Player> = self
            .active_players()
            .filter(|player| self.round.prompts.contains_key(&player.id))
            .collect();
        !drawers.is_empty()
            && drawers
                .iter()
                .all(|player| self.round.drawings.contains_key(&player.id))
    }

    fn connected_guessers_done(&self) -> bool {
        let eligible_count = self.eligible_voter_count();
        eligible_count == 0 || self.connected_submissions_done(&self.round.guesses)
    }

    fn connected_voters_done(&self) -> bool {
        let eligible_count = self.eligible_voter_count();
        eligible_count == 0 || self.connected_submissions_done(&self.round.votes)
    }

    fn connected_submissions_done(&self, submissions: &BTreeMap<String, String>) -> bool {
        self.active_players()
            .filter(|player| self.round.prompts.contains_key(&player.id))
            .filter(|player| self.round.current_artist_id.as_deref() != Some(player.id.as_str()))
            .all(|player| submissions.contains_key(&player.id))
    }

    fn public_players(&self) -> Vec<PlayerPublic> {
        self.players
            .values()
            .map(|player| PlayerPublic {
                id: player.id.clone(),
                name: player.name.clone(),
                score: player.score,
                connected: player.connected,
                spectator: player.spectator,
                is_host: self.host_player_id.as_deref() == Some(player.id.as_str()),
            })
            .collect()
    }

    fn final_scores(&self) -> Vec<ScoreEntry> {
        let mut scores_by_player = self.retired_scores.clone();
        for player in self.players.values().filter(|player| player.has_played) {
            scores_by_player.insert(
                player.id.clone(),
                ScoreEntry {
                    player_id: player.id.clone(),
                    name: player.name.clone(),
                    score: player.score,
                },
            );
        }
        let mut scores: Vec<ScoreEntry> = scores_by_player.into_values().collect();
        scores.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.name.cmp(&b.name)));
        scores
    }

    fn total_rounds(&self) -> u8 {
        match self.game_mode {
            GameMode::Party => self.settings.rounds,
            GameMode::Practice => 1,
        }
    }

    fn deadline_extension_available(&self, now_ms: u64) -> bool {
        let timed_phase = match self.phase {
            GamePhase::Drawing | GamePhase::Guessing | GamePhase::Voting => true,
            GamePhase::Lobby | GamePhase::Results | GamePhase::FinalScores => false,
        };
        timed_phase
            && !self.deadline_extension_used
            && self
                .deadline_ms
                .is_some_and(|deadline_ms| now_ms < deadline_ms)
    }

    fn ensure_final_scores_unlocked(&self, now_ms: u64) -> EngineResult<()> {
        if self
            .deadline_ms
            .is_some_and(|unlock_deadline_ms| now_ms < unlock_deadline_ms)
        {
            return Err(EngineError::new(
                "final_scores_locked",
                "Let the final scores land before starting again.",
            ));
        }
        Ok(())
    }

    fn active_players(&self) -> impl Iterator<Item = &Player> {
        self.players.values().filter(|player| is_active(player))
    }
}

fn is_active(player: &Player) -> bool {
    player.connected && !player.spectator
}

pub fn generate_room_code(existing: &BTreeSet<String>) -> String {
    let mut rng = rand::thread_rng();
    loop {
        let code: String = (0..4)
            .map(|_| char::from(b'A' + rng.gen_range(0..26)))
            .collect();
        if !existing.contains(&code) {
            return code;
        }
    }
}

fn normalize_room_settings(mut settings: RoomSettings) -> EngineResult<RoomSettings> {
    settings.prompt_pack_id = settings.prompt_pack_id.trim().to_string();
    settings.rounds = settings.rounds.clamp(MIN_ROUNDS, MAX_ROUNDS);
    settings.draw_seconds = settings
        .draw_seconds
        .clamp(MIN_DRAW_SECONDS, MAX_DRAW_SECONDS);
    settings.guess_seconds = settings
        .guess_seconds
        .clamp(MIN_GUESS_SECONDS, MAX_GUESS_SECONDS);
    settings.vote_seconds = settings
        .vote_seconds
        .clamp(MIN_VOTE_SECONDS, MAX_VOTE_SECONDS);
    settings.results_seconds = settings
        .results_seconds
        .clamp(MIN_RESULTS_SECONDS, MAX_RESULTS_SECONDS);
    validate_room_settings(&settings)?;
    Ok(settings)
}

pub fn validate_room_settings(settings: &RoomSettings) -> EngineResult<()> {
    if !(MIN_ROUNDS..=MAX_ROUNDS).contains(&settings.rounds) {
        return Err(EngineError::new(
            "invalid_settings",
            format!("Rounds must be between {MIN_ROUNDS} and {MAX_ROUNDS}."),
        ));
    }
    if !(MIN_DRAW_SECONDS..=MAX_DRAW_SECONDS).contains(&settings.draw_seconds) {
        return Err(EngineError::new(
            "invalid_settings",
            format!(
                "Drawing time must be between {MIN_DRAW_SECONDS} and {MAX_DRAW_SECONDS} seconds."
            ),
        ));
    }
    if !(MIN_GUESS_SECONDS..=MAX_GUESS_SECONDS).contains(&settings.guess_seconds) {
        return Err(EngineError::new(
            "invalid_settings",
            format!(
                "Guessing time must be between {MIN_GUESS_SECONDS} and {MAX_GUESS_SECONDS} seconds."
            ),
        ));
    }
    if !(MIN_VOTE_SECONDS..=MAX_VOTE_SECONDS).contains(&settings.vote_seconds) {
        return Err(EngineError::new(
            "invalid_settings",
            format!(
                "Voting time must be between {MIN_VOTE_SECONDS} and {MAX_VOTE_SECONDS} seconds."
            ),
        ));
    }
    if !(MIN_RESULTS_SECONDS..=MAX_RESULTS_SECONDS).contains(&settings.results_seconds) {
        return Err(EngineError::new(
            "invalid_settings",
            format!(
                "Results time must be between {MIN_RESULTS_SECONDS} and {MAX_RESULTS_SECONDS} seconds."
            ),
        ));
    }
    if prompt_pack_prompts(&settings.prompt_pack_id).is_none() {
        return Err(EngineError::new(
            "invalid_prompt_pack",
            "That prompt pack is not available.",
        ));
    }
    Ok(())
}

fn deadline_after(now_ms: u64, seconds: u64) -> u64 {
    now_ms.saturating_add(seconds.saturating_mul(1000))
}

fn is_allowed_reaction(emoji: &str) -> bool {
    ALLOWED_REACTIONS.contains(&emoji)
}

fn apply_score_events(
    players: &mut BTreeMap<String, Player>,
    pending_events: &[PendingScoreEvent],
) -> (BTreeMap<String, i32>, Vec<ScoreEvent>) {
    let mut score_delta_by_player: BTreeMap<String, i32> = players
        .keys()
        .map(|player_id| (player_id.clone(), 0))
        .collect();
    let mut score_events = Vec::with_capacity(pending_events.len());

    for pending in pending_events {
        let related_player_name = pending
            .related_player_id
            .as_ref()
            .and_then(|player_id| players.get(player_id))
            .map(|player| player.name.clone());
        let Some(player) = players.get_mut(&pending.player_id) else {
            continue;
        };
        player.score = player.score.saturating_add(pending.points);
        *score_delta_by_player
            .entry(pending.player_id.clone())
            .or_default() += pending.points;
        score_events.push(ScoreEvent {
            kind: pending.kind,
            player_id: player.id.clone(),
            name: player.name.clone(),
            points: pending.points,
            related_player_id: pending.related_player_id.clone(),
            related_player_name,
        });
    }

    (score_delta_by_player, score_events)
}

pub fn sanitize_name(name: &str) -> String {
    let trimmed = name.trim();
    let fallback = if trimmed.is_empty() {
        "Player"
    } else {
        trimmed
    };
    fallback.chars().take(MAX_NAME_LEN).collect()
}

pub fn sanitize_guess(guess: &str) -> EngineResult<String> {
    let trimmed = guess.trim();
    if trimmed.is_empty() {
        return Err(EngineError::new(
            "empty_guess",
            "Enter a guess before submitting.",
        ));
    }
    Ok(trimmed.chars().take(MAX_GUESS_LEN).collect())
}

pub fn validate_drawing(drawing: &DrawingDoc) -> EngineResult<()> {
    if drawing.width != CANVAS_WIDTH || drawing.height != CANVAS_HEIGHT {
        return Err(EngineError::new(
            "invalid_drawing_size",
            "Drawing uses an unsupported canvas size.",
        ));
    }
    if drawing.strokes.is_empty() {
        return Err(EngineError::new(
            "blank_drawing",
            "Draw at least one stroke before submitting.",
        ));
    }
    if drawing.strokes.len() > MAX_STROKES {
        return Err(EngineError::new(
            "drawing_too_large",
            "Drawing has too many strokes.",
        ));
    }
    for stroke in &drawing.strokes {
        validate_stroke(stroke)?;
    }
    Ok(())
}

fn validate_stroke(stroke: &Stroke) -> EngineResult<()> {
    if stroke.points.len() > MAX_POINTS_PER_STROKE {
        return Err(EngineError::new(
            "stroke_too_large",
            "A stroke has too many points.",
        ));
    }
    if stroke.points.len() < 2 {
        return Err(EngineError::new(
            "stroke_too_short",
            "A stroke needs at least two points.",
        ));
    }
    if stroke.size == 0 || stroke.size > 32 {
        return Err(EngineError::new(
            "invalid_brush",
            "Brush size is outside the allowed range.",
        ));
    }
    if !is_valid_color(&stroke.color) {
        return Err(EngineError::new(
            "invalid_color",
            "Stroke color must be a hex color.",
        ));
    }
    for Point { x, y } in &stroke.points {
        if *x > CANVAS_WIDTH || *y > CANVAS_HEIGHT {
            return Err(EngineError::new(
                "point_out_of_bounds",
                "Drawing point is outside the canvas.",
            ));
        }
    }
    Ok(())
}

fn is_valid_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_hexdigit())
}

fn normalize_text(text: &str) -> String {
    text.nfc()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests;
