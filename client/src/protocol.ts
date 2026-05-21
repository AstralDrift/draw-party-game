export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 768;

export type Role = 'display' | 'player';
export type GamePhase = 'lobby' | 'drawing' | 'guessing' | 'voting' | 'results' | 'finalScores';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  color: string;
  size: number;
  points: Point[];
}

export interface DrawingDoc {
  width: number;
  height: number;
  strokes: Stroke[];
}

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface VotingOption {
  id: string;
  text: string;
  authorPlayerId?: string | null;
  authorName?: string | null;
  isCorrect: boolean;
}

export interface VoteBreakdown {
  optionId: string;
  optionText: string;
  voterNames: string[];
  isCorrect: boolean;
  authorName?: string | null;
}

export interface RoundResult {
  artistId: string;
  artistName: string;
  correctAnswer: string;
  correctVoterNames: string[];
  breakdown: VoteBreakdown[];
}

export interface ScoreEntry {
  playerId: string;
  name: string;
  score: number;
}

export interface RoomSnapshot {
  roomCode: string;
  phase: GamePhase;
  players: PlayerPublic[];
  minPlayers: number;
  maxPlayers: number;
  currentRound: number;
  totalRounds: number;
  turnToken: number;
  deadlineMs?: number | null;
  currentArtistId?: string | null;
  currentArtistName?: string | null;
  currentDrawing?: DrawingDoc | null;
  votingOptions: VotingOption[];
  roundResult?: RoundResult | null;
  finalScores: ScoreEntry[];
  drawingSubmittedIds: string[];
  guessSubmittedIds: string[];
  voteSubmittedIds: string[];
}

export type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomCode: string; name: string }
  | { type: 'setName'; name: string }
  | { type: 'startGame' }
  | { type: 'submitDrawing'; turnToken: number; drawing: DrawingDoc }
  | { type: 'submitGuess'; turnToken: number; guess: string }
  | { type: 'submitVote'; turnToken: number; optionId: string }
  | { type: 'heartbeat' }
  | { type: 'leaveRoom' };

export type ServerMessage =
  | { type: 'roomSnapshot'; snapshot: RoomSnapshot }
  | { type: 'phaseChanged'; snapshot: RoomSnapshot }
  | { type: 'promptAssigned'; prompt: string }
  | { type: 'playerListChanged'; players: PlayerPublic[] }
  | { type: 'drawingReveal'; artistId: string; artistName: string; drawing: DrawingDoc }
  | { type: 'votingOptions'; options: VotingOption[] }
  | { type: 'roundResult'; result: RoundResult }
  | { type: 'finalScores'; scores: ScoreEntry[] }
  | { type: 'pong'; nowMs: number }
  | { type: 'error'; code: string; message: string };

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as { type?: unknown };
  return typeof maybe.type === 'string';
}

export function phaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'lobby':
      return 'Lobby';
    case 'drawing':
      return 'Drawing';
    case 'guessing':
      return 'Guessing';
    case 'voting':
      return 'Voting';
    case 'results':
      return 'Results';
    case 'finalScores':
      return 'Final Scores';
  }
}
