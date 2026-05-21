use crate::protocol::{
    DrawingDoc, GamePhase, PlayerPublic, Point, RoomSnapshot, RoundResult, ScoreEntry, Stroke,
    VoteBreakdown, VotingOption, CANVAS_HEIGHT, CANVAS_WIDTH, DRAW_SECONDS, GUESS_SECONDS,
    MAX_GUESS_LEN, MAX_NAME_LEN, MAX_PLAYERS, MAX_POINTS_PER_STROKE, MAX_STROKES, MIN_PLAYERS,
    ROOM_TTL_MS, TOTAL_ROUNDS, VOTE_SECONDS,
};
use rand::{seq::SliceRandom, Rng};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const PROMPTS: &[&str] = &[
    "vampire dentist",
    "pizza lifeguard",
    "robot doing yoga",
    "haunted toaster",
    "wizard with stage fright",
    "moon on a first date",
    "cowboy accountant",
    "spaghetti tornado",
    "cat running a courtroom",
    "shark at a job interview",
    "grandma riding a comet",
    "turtle winning a marathon",
    "alien learning to skateboard",
    "snowman at the beach",
    "dragon selling insurance",
    "banana detective",
    "pirate in a library",
    "ghost taking a selfie",
    "octopus barista",
    "unicorn traffic cop",
    "angry refrigerator",
    "hamster business meeting",
    "skeleton birthday party",
    "penguin rock concert",
    "time traveler stuck in traffic",
    "ninja cooking pancakes",
    "giraffe in an elevator",
    "mermaid at a dentist",
    "monster babysitting",
    "wizard losing WiFi",
    "chair with stage dreams",
    "cloud walking a dog",
    "frog hosting a podcast",
    "mummy on vacation",
    "robot afraid of magnets",
    "potato superhero",
    "zombie ordering coffee",
    "castle with tiny legs",
    "fish driving a taxi",
    "bear at a tea party",
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub score: i32,
    pub connected: bool,
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
pub struct Room {
    pub code: String,
    pub phase: GamePhase,
    pub players: BTreeMap<String, Player>,
    pub displays: BTreeSet<String>,
    pub current_round: u8,
    pub total_rounds: u8,
    pub turn_token: u64,
    pub deadline_ms: Option<u64>,
    pub round: RoundState,
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
    pub fn new(code: String, display_id: String, now_ms: u64) -> Self {
        let mut displays = BTreeSet::new();
        displays.insert(display_id);

        Self {
            code,
            phase: GamePhase::Lobby,
            players: BTreeMap::new(),
            displays,
            current_round: 0,
            total_rounds: TOTAL_ROUNDS,
            turn_token: 0,
            deadline_ms: None,
            round: RoundState::default(),
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
        self.touch(now_ms);
        let safe_name = sanitize_name(&name);
        if self.phase != GamePhase::Lobby && !self.players.contains_key(&player_id) {
            return Err(EngineError::new(
                "game_in_progress",
                "New players can join before the game starts.",
            ));
        }

        if !self.players.contains_key(&player_id) && self.players.len() >= MAX_PLAYERS {
            return Err(EngineError::new(
                "room_full",
                format!("Rooms are capped at {MAX_PLAYERS} players."),
            ));
        }

        self.players
            .entry(player_id.clone())
            .and_modify(|player| {
                player.name = safe_name.clone();
                player.connected = true;
            })
            .or_insert(Player {
                id: player_id,
                name: safe_name,
                score: 0,
                connected: true,
            });

        Ok(())
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

    pub fn mark_disconnected(&mut self, client_id: &str, now_ms: u64) {
        self.touch(now_ms);
        self.displays.remove(client_id);
        if let Some(player) = self.players.get_mut(client_id) {
            player.connected = false;
        }
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
        self.touch(now_ms);
        if self.phase != GamePhase::Drawing {
            return Err(EngineError::new(
                "invalid_phase",
                "Drawings are only accepted during drawing.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
        if !self.players.contains_key(player_id) {
            return Err(EngineError::new(
                "not_joined",
                "Only joined players can submit drawings.",
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
        if self.round.drawings.len() >= self.players.len() {
            self.begin_guessing(now_ms)?;
            Ok(EngineEvent::PhaseChanged)
        } else {
            Ok(EngineEvent::Snapshot)
        }
    }

    pub fn submit_guess(
        &mut self,
        player_id: &str,
        turn_token: u64,
        guess: String,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        self.touch(now_ms);
        if self.phase != GamePhase::Guessing {
            return Err(EngineError::new(
                "invalid_phase",
                "Guesses are only accepted during guessing.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
        self.ensure_active_non_artist(player_id)?;
        if self.round.guesses.contains_key(player_id) {
            return Err(EngineError::new(
                "duplicate_submission",
                "Guess already submitted.",
            ));
        }

        self.round
            .guesses
            .insert(player_id.to_string(), sanitize_guess(&guess)?);
        if self.round.guesses.len() >= self.eligible_voter_count() {
            self.begin_voting(now_ms)?;
            Ok(EngineEvent::PhaseChanged)
        } else {
            Ok(EngineEvent::Snapshot)
        }
    }

    pub fn submit_vote(
        &mut self,
        player_id: &str,
        turn_token: u64,
        option_id: String,
        now_ms: u64,
    ) -> EngineResult<EngineEvent> {
        self.touch(now_ms);
        if self.phase != GamePhase::Voting {
            return Err(EngineError::new(
                "invalid_phase",
                "Votes are only accepted during voting.",
            ));
        }
        self.ensure_turn_token(turn_token)?;
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
        if self.round.votes.len() >= self.eligible_voter_count() {
            self.finish_voting(now_ms)?;
            Ok(EngineEvent::PhaseChanged)
        } else {
            Ok(EngineEvent::Snapshot)
        }
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
            _ => Ok(None),
        }
    }

    pub fn is_expired(&self, now_ms: u64) -> bool {
        self.displays.is_empty()
            && self.players.values().all(|player| !player.connected)
            && now_ms.saturating_sub(self.last_active_ms) > ROOM_TTL_MS
    }

    pub fn snapshot(&self) -> RoomSnapshot {
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
            current_round: self.current_round,
            total_rounds: self.total_rounds,
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
        if self.players.len() < MIN_PLAYERS {
            return Err(EngineError::new(
                "not_enough_players",
                format!("Need at least {MIN_PLAYERS} players to start."),
            ));
        }

        if self.current_round == 0 || self.phase == GamePhase::FinalScores {
            self.current_round = 1;
            for player in self.players.values_mut() {
                player.score = 0;
            }
        } else {
            self.current_round = self.current_round.saturating_add(1);
        }

        self.phase = GamePhase::Drawing;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = Some(now_ms + DRAW_SECONDS * 1000);
        self.round = RoundState::default();

        let mut player_ids: Vec<String> = self.players.keys().cloned().collect();
        let mut rng = rand::thread_rng();
        player_ids.shuffle(&mut rng);
        self.round.order = player_ids.clone();

        let mut prompts: Vec<&str> = PROMPTS.to_vec();
        prompts.shuffle(&mut rng);
        for (index, player_id) in player_ids.iter().enumerate() {
            let prompt = prompts[index % prompts.len()].to_string();
            self.round.prompts.insert(player_id.clone(), prompt);
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
        self.deadline_ms = Some(now_ms + GUESS_SECONDS * 1000);
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

        let mut seen = BTreeSet::from([normalize_text(&options[0].text)]);
        for (player_id, guess) in &self.round.guesses {
            let normalized = normalize_text(guess);
            if normalized.is_empty() || seen.contains(&normalized) {
                continue;
            }
            seen.insert(normalized);
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
        self.deadline_ms = Some(now_ms + VOTE_SECONDS * 1000);
        Ok(())
    }

    fn finish_voting(&mut self, _now_ms: u64) -> EngineResult<()> {
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
                if let Some(voter) = self.players.get_mut(voter_id) {
                    voter.score += 200;
                }
                if let Some(artist) = self.players.get_mut(&artist_id) {
                    artist.score += 100;
                }
            } else if let Some(author_id) = &option.author_player_id {
                if let Some(author) = self.players.get_mut(author_id) {
                    author.score += 50;
                }
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

        self.round.result = Some(RoundResult {
            artist_id,
            artist_name,
            correct_answer,
            correct_voter_names,
            breakdown,
        });
        self.phase = GamePhase::Results;
        self.turn_token = self.turn_token.saturating_add(1);
        self.deadline_ms = None;
        Ok(())
    }

    fn reset_to_lobby_after_empty_drawing_timeout(&mut self) {
        self.phase = GamePhase::Lobby;
        self.deadline_ms = None;
        self.current_round = self.current_round.saturating_sub(1);
        self.turn_token = self.turn_token.saturating_add(1);
        self.round = RoundState::default();
    }

    fn advance_after_results(&mut self, now_ms: u64) -> EngineResult<bool> {
        if self.next_artist_with_drawing().is_some() {
            self.begin_guessing(now_ms)?;
            return Ok(false);
        }

        if self.current_round >= self.total_rounds {
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

    fn ensure_active_non_artist(&self, player_id: &str) -> EngineResult<()> {
        if !self.players.contains_key(player_id) {
            return Err(EngineError::new(
                "not_joined",
                "Only joined players can submit.",
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

    fn ensure_turn_token(&self, turn_token: u64) -> EngineResult<()> {
        if self.turn_token != turn_token {
            return Err(EngineError::new(
                "stale_turn",
                "That submission belongs to an old turn.",
            ));
        }
        Ok(())
    }

    fn eligible_voter_count(&self) -> usize {
        self.players
            .keys()
            .filter(|player_id| self.round.current_artist_id.as_deref() != Some(player_id.as_str()))
            .count()
    }

    fn public_players(&self) -> Vec<PlayerPublic> {
        self.players
            .values()
            .map(|player| PlayerPublic {
                id: player.id.clone(),
                name: player.name.clone(),
                score: player.score,
                connected: player.connected,
            })
            .collect()
    }

    fn final_scores(&self) -> Vec<ScoreEntry> {
        let mut scores: Vec<ScoreEntry> = self
            .players
            .values()
            .map(|player| ScoreEntry {
                player_id: player.id.clone(),
                name: player.name.clone(),
                score: player.score,
            })
            .collect();
        scores.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.name.cmp(&b.name)));
        scores
    }
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
    text.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let mut room = Room::new("ABCD".to_string(), "display".to_string(), 0);
        room.upsert_player("p1".to_string(), "Ada".to_string(), 1)
            .unwrap();
        room.upsert_player("p2".to_string(), "Grace".to_string(), 1)
            .unwrap();
        room.upsert_player("p3".to_string(), "Linus".to_string(), 1)
            .unwrap();
        room
    }

    #[test]
    fn starts_drawing_with_unique_prompts() {
        let mut room = room_with_players();
        room.handle_start_or_advance(100).unwrap();
        assert_eq!(room.phase, GamePhase::Drawing);
        assert_eq!(room.round.prompts.len(), 3);
        assert_eq!(room.round.order.len(), 3);
        assert!(room.deadline_ms.is_some());
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
        assert_eq!(
            room.round.result.as_ref().unwrap().correct_answer,
            prompts.get(&artist).unwrap().to_string()
        );
        assert!(room.players.get(&artist).unwrap().score > 0);
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
        let event = room.advance_if_expired(100 + DRAW_SECONDS * 1000).unwrap();
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

        let event = room.advance_if_expired(200 + GUESS_SECONDS * 1000).unwrap();
        assert_eq!(event, Some(EngineEvent::PhaseChanged));
        assert_eq!(room.phase, GamePhase::Results);
        assert!(room.round.result.is_some());
    }
}
