use crate::prompts::prompt_pack_prompts;
use crate::protocol::{
    DrawingDoc, GamePhase, PlayerPublic, Point, ReactionBurst, RoomSettings, RoomSnapshot,
    RoundResult, ScoreDelta, ScoreEntry, Stroke, VoteBreakdown, VotingOption, ALLOWED_REACTIONS,
    CANVAS_HEIGHT, CANVAS_WIDTH, MAX_DRAW_SECONDS, MAX_GUESS_LEN, MAX_GUESS_SECONDS, MAX_NAME_LEN,
    MAX_PLAYERS, MAX_POINTS_PER_STROKE, MAX_RESULTS_SECONDS, MAX_ROUNDS, MAX_STROKES,
    MAX_VOTE_SECONDS, MIN_DRAW_SECONDS, MIN_GUESS_SECONDS, MIN_PLAYERS, MIN_RESULTS_SECONDS,
    MIN_ROUNDS, MIN_VOTE_SECONDS, REACTION_COOLDOWN_MS, ROOM_TTL_MS,
};
use rand::{seq::SliceRandom, Rng};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use unicode_normalization::UnicodeNormalization;

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
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct PendingDrawingRetry {
    prompt_pack_id: String,
    prompts: BTreeMap<String, String>,
    order: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Room {
    pub code: String,
    #[serde(skip)]
    pub host_token: String,
    pub phase: GamePhase,
    pub players: BTreeMap<String, Player>,
    #[serde(default)]
    pub host_player_id: Option<String>,
    pub displays: BTreeSet<String>,
    pub settings: RoomSettings,
    pub current_round: u8,
    pub turn_token: u64,
    pub deadline_ms: Option<u64>,
    pub round: RoundState,
    #[serde(default)]
    used_prompt_keys: BTreeSet<String>,
    #[serde(default)]
    pending_drawing_retry: Option<PendingDrawingRetry>,
    #[serde(default)]
    current_round_prompt_viewers: BTreeSet<String>,
    #[serde(default)]
    retired_scores: BTreeMap<String, ScoreEntry>,
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
            players: BTreeMap::new(),
            host_player_id: None,
            displays,
            settings: RoomSettings::default(),
            current_round: 0,
            turn_token: 0,
            deadline_ms: None,
            round: RoundState::default(),
            used_prompt_keys: BTreeSet::new(),
            pending_drawing_retry: None,
            current_round_prompt_viewers: BTreeSet::new(),
            retired_scores: BTreeMap::new(),
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
        let safe_name = sanitize_name(&name);
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

        let restored_score = if self.players.contains_key(&player_id) {
            None
        } else {
            self.retired_scores.remove(&player_id)
        };

        self.players
            .entry(player_id.clone())
            .and_modify(|player| {
                player.name = safe_name.clone();
                player.connected = true;
            })
            .or_insert_with(|| Player {
                id: player_id,
                name: safe_name,
                score: restored_score.as_ref().map_or(0, |entry| entry.score),
                connected: true,
                spectator: joining_as_spectator,
                joined_at_ms: now_ms,
                last_reaction_ms: 0,
                session_token,
                has_played: restored_score.is_some(),
            });
        self.ensure_host();

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
        let safe_name = sanitize_name(&name);
        let player = self.players.get_mut(player_id).ok_or_else(|| {
            EngineError::new("not_joined", "Join the room before setting a name.")
        })?;
        player.name = safe_name;
        Ok(())
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
        if self
            .pending_drawing_retry
            .as_ref()
            .is_some_and(|retry| retry.prompt_pack_id != settings.prompt_pack_id)
        {
            return Err(EngineError::new(
                "prompt_pack_locked",
                "Finish retrying this drawing round before changing prompt packs.",
            ));
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
            GamePhase::Lobby | GamePhase::FinalScores => {
                self.start_drawing_round(now_ms)?;
                Ok(EngineEvent::PhaseChanged)
            }
            GamePhase::Results => {
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
        self.ensure_guess_available(&guess)?;
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

        if option.author_player_id.as_deref() == Some(player_id) {
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

        self.touch(now_ms);
        match self.phase {
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
                if self.advance_after_results(now_ms)? {
                    Ok(Some(EngineEvent::FinalScores))
                } else {
                    Ok(Some(EngineEvent::PhaseChanged))
                }
            }
            _ => Ok(None),
        }
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
            players: self.public_players(),
            min_players: MIN_PLAYERS,
            max_players: MAX_PLAYERS,
            settings: self.settings.clone(),
            server_now_ms,
            current_round: self.current_round,
            total_rounds: self.settings.rounds,
            turn_token: self.turn_token,
            deadline_ms: self.deadline_ms,
            current_artist_id,
            current_artist_name,
            current_drawing,
            voting_options,
            round_result: self.round.result.clone(),
            final_scores: self.final_scores(),
            drawing_submitted_ids: self.round.drawings.keys().cloned().collect(),
            guess_submitted_ids: self.round.guesses.keys().cloned().collect(),
            vote_submitted_ids: self.round.votes.keys().cloned().collect(),
        }
    }

    pub fn prompt_for_player(&self, player_id: &str) -> Option<String> {
        self.round.prompts.get(player_id).cloned()
    }

    fn start_drawing_round(&mut self, now_ms: u64) -> EngineResult<()> {
        if self.phase == GamePhase::Lobby && self.pending_drawing_retry.is_some() {
            return self.resume_pending_drawing_round(now_ms);
        }

        let reset_prompt_history = self.phase == GamePhase::FinalScores;
        let prompt_pack = prompt_pack_prompts(&self.settings.prompt_pack_id).ok_or_else(|| {
            EngineError::new("invalid_prompt_pack", "That prompt pack is not available.")
        })?;
        let connected_count = self
            .players
            .values()
            .filter(|player| player.connected)
            .count();
        if connected_count < MIN_PLAYERS {
            let player_word = if MIN_PLAYERS == 1 {
                "player"
            } else {
                "players"
            };
            return Err(EngineError::new(
                "not_enough_players",
                format!("Need at least {MIN_PLAYERS} {player_word} to start."),
            ));
        }
        let mut available_prompts: Vec<&str> = prompt_pack
            .iter()
            .copied()
            .filter(|prompt| {
                reset_prompt_history || !self.used_prompt_keys.contains(&normalize_text(prompt))
            })
            .collect();
        if available_prompts.len() < connected_count {
            return Err(EngineError::new(
                "prompt_pack_exhausted",
                "The selected prompt pack does not have enough unused prompts for this round.",
            ));
        }

        if self.phase == GamePhase::Results {
            // Keep the game roster, scores, and reconnect credentials stable between rounds.
            // Connected late-join spectators become eligible. Disconnected players sit this
            // whole round out even if they reconnect, then return on the next drawing round.
            for player in self.players.values_mut() {
                player.spectator = !player.connected;
            }
        } else {
            // A lobby start or Play Again begins a fresh game with the phones currently present.
            self.players.retain(|_, player| player.connected);
            self.promote_spectators();
        }

        if self.current_round == 0 || self.phase == GamePhase::FinalScores {
            self.current_round = 1;
            self.retired_scores.clear();
            for player in self.players.values_mut() {
                player.score = 0;
                player.has_played = false;
            }
        } else {
            self.current_round = self.current_round.saturating_add(1);
        }

        self.phase = GamePhase::Drawing;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.draw_seconds));
        self.round = RoundState::default();
        if reset_prompt_history {
            self.used_prompt_keys.clear();
            self.pending_drawing_retry = None;
        }

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
        if connected_assigned_count + replacement_count < MIN_PLAYERS {
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

        let mut options = vec![VotingOption {
            id: String::new(),
            text: correct_answer,
            author_player_id: None,
            author_name: None,
            is_correct: true,
        }];

        for (player_id, guess) in &self.round.guesses {
            let author_name = self
                .players
                .get(player_id)
                .map(|player| player.name.clone());
            options.push(VotingOption {
                id: String::new(),
                text: guess.clone(),
                author_player_id: Some(player_id.clone()),
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
        if self.round.voting_options.len() < 2 {
            self.finish_voting(now_ms)?;
            return Ok(());
        }
        self.phase = GamePhase::Voting;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.vote_seconds));
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
        let mut score_delta_by_player: BTreeMap<String, i32> = self
            .players
            .keys()
            .map(|player_id| (player_id.clone(), 0))
            .collect();

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
                add_score_delta(&mut self.players, &mut score_delta_by_player, voter_id, 200);
                add_score_delta(
                    &mut self.players,
                    &mut score_delta_by_player,
                    &artist_id,
                    100,
                );
            } else if let Some(author_id) = &option.author_player_id {
                add_score_delta(&mut self.players, &mut score_delta_by_player, author_id, 50);
            }
        }

        let eligible_voter_ids: Vec<String> = self
            .round
            .prompts
            .keys()
            .filter(|player_id| **player_id != artist_id)
            .cloned()
            .collect();
        let nobody_found_it = correct_voter_names.is_empty() && !eligible_voter_ids.is_empty();
        let perfect_truth = !eligible_voter_ids.is_empty()
            && eligible_voter_ids.iter().all(|voter_id| {
                self.round.votes.get(voter_id).is_some_and(|option_id| {
                    self.round
                        .voting_options
                        .iter()
                        .any(|option| option.id == *option_id && option.is_correct)
                })
            });

        if nobody_found_it {
            add_score_delta(
                &mut self.players,
                &mut score_delta_by_player,
                &artist_id,
                50,
            );
        }
        if perfect_truth {
            for voter_id in &eligible_voter_ids {
                add_score_delta(&mut self.players, &mut score_delta_by_player, voter_id, 25);
            }
        }

        let breakdown = self
            .round
            .voting_options
            .iter()
            .map(|option| VoteBreakdown {
                option_id: option.id.clone(),
                option_text: option.text.clone(),
                voter_names: breakdown_by_option.remove(&option.id).unwrap_or_default(),
                is_correct: option.is_correct,
                author_name: option.author_name.clone(),
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
            })
            .collect();

        self.round.result = Some(RoundResult {
            artist_id,
            artist_name,
            correct_answer,
            correct_voter_names,
            breakdown,
            score_deltas,
            nobody_found_it,
            perfect_truth,
        });
        self.phase = GamePhase::Results;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(deadline_after(now_ms, self.settings.results_seconds));
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
        self.turn_token = self.turn_token.saturating_add(1);
        self.round = RoundState::default();
    }

    fn advance_after_results(&mut self, now_ms: u64) -> EngineResult<bool> {
        if self.has_next_artist_with_drawing() {
            self.begin_guessing(now_ms)?;
            return Ok(false);
        }

        if self.current_round >= self.settings.rounds {
            self.phase = GamePhase::FinalScores;
            self.deadline_ms = None;
            return Ok(true);
        }

        self.start_drawing_round(now_ms)?;
        Ok(false)
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

    fn ensure_guess_available(&self, guess: &str) -> EngineResult<()> {
        let normalized_guess = normalize_text(guess);
        let correct_answer = self
            .round
            .current_artist_id
            .as_deref()
            .and_then(|artist_id| self.round.prompts.get(artist_id))
            .ok_or_else(|| EngineError::new("missing_prompt", "No prompt is active."))?;
        let conflicts = normalized_guess == normalize_text(correct_answer)
            || self
                .round
                .guesses
                .values()
                .any(|accepted| normalize_text(accepted) == normalized_guess);
        if conflicts {
            return Err(EngineError::new(
                "guess_conflict",
                "That title can't be used. Try a different one.",
            ));
        }
        Ok(())
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

fn add_score_delta(
    players: &mut BTreeMap<String, Player>,
    score_delta_by_player: &mut BTreeMap<String, i32>,
    player_id: &str,
    delta: i32,
) {
    if let Some(player) = players.get_mut(player_id) {
        player.score += delta;
        *score_delta_by_player
            .entry(player_id.to_string())
            .or_default() += delta;
    }
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
