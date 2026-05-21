use serde::{Deserialize, Serialize};

pub const CANVAS_WIDTH: u16 = 1024;
pub const CANVAS_HEIGHT: u16 = 768;
pub const MAX_PLAYERS: usize = 8;
pub const MIN_PLAYERS: usize = 2;
pub const TOTAL_ROUNDS: u8 = 5;
pub const DRAW_SECONDS: u64 = 90;
pub const GUESS_SECONDS: u64 = 45;
pub const VOTE_SECONDS: u64 = 30;
pub const ROOM_TTL_MS: u64 = 3 * 60 * 60 * 1000;
pub const MAX_STROKES: usize = 220;
pub const MAX_POINTS_PER_STROKE: usize = 180;
pub const MAX_NAME_LEN: usize = 24;
pub const MAX_GUESS_LEN: usize = 60;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Display,
    Player,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GamePhase {
    Lobby,
    Drawing,
    Guessing,
    Voting,
    Results,
    FinalScores,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Point {
    pub x: u16,
    pub y: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub color: String,
    pub size: u8,
    pub points: Vec<Point>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingDoc {
    pub width: u16,
    pub height: u16,
    pub strokes: Vec<Stroke>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerPublic {
    pub id: String,
    pub name: String,
    pub score: i32,
    pub connected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VotingOption {
    pub id: String,
    pub text: String,
    pub author_player_id: Option<String>,
    pub author_name: Option<String>,
    pub is_correct: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoteBreakdown {
    pub option_id: String,
    pub option_text: String,
    pub voter_names: Vec<String>,
    pub is_correct: bool,
    pub author_name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoundResult {
    pub artist_id: String,
    pub artist_name: String,
    pub correct_answer: String,
    pub correct_voter_names: Vec<String>,
    pub breakdown: Vec<VoteBreakdown>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreEntry {
    pub player_id: String,
    pub name: String,
    pub score: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoomSnapshot {
    pub room_code: String,
    pub phase: GamePhase,
    pub players: Vec<PlayerPublic>,
    pub min_players: usize,
    pub max_players: usize,
    pub current_round: u8,
    pub total_rounds: u8,
    pub turn_token: u64,
    pub deadline_ms: Option<u64>,
    pub current_artist_id: Option<String>,
    pub current_artist_name: Option<String>,
    pub current_drawing: Option<DrawingDoc>,
    pub voting_options: Vec<VotingOption>,
    pub round_result: Option<RoundResult>,
    pub final_scores: Vec<ScoreEntry>,
    pub drawing_submitted_ids: Vec<String>,
    pub guess_submitted_ids: Vec<String>,
    pub vote_submitted_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientMessage {
    CreateRoom,
    JoinRoom {
        room_code: String,
        name: String,
    },
    SetName {
        name: String,
    },
    StartGame,
    SubmitDrawing {
        turn_token: u64,
        drawing: DrawingDoc,
    },
    SubmitGuess {
        turn_token: u64,
        guess: String,
    },
    SubmitVote {
        turn_token: u64,
        option_id: String,
    },
    Heartbeat,
    LeaveRoom,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerMessage {
    RoomSnapshot {
        snapshot: RoomSnapshot,
    },
    PhaseChanged {
        snapshot: RoomSnapshot,
    },
    PromptAssigned {
        prompt: String,
    },
    PlayerListChanged {
        players: Vec<PlayerPublic>,
    },
    DrawingReveal {
        artist_id: String,
        artist_name: String,
        drawing: DrawingDoc,
    },
    VotingOptions {
        options: Vec<VotingOption>,
    },
    RoundResult {
        result: RoundResult,
    },
    FinalScores {
        scores: Vec<ScoreEntry>,
    },
    Pong {
        now_ms: u64,
    },
    Error {
        code: String,
        message: String,
    },
}
