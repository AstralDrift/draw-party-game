export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 768;

export type Role = 'display' | 'player';
export type GamePhase = 'lobby' | 'drawing' | 'guessing' | 'voting' | 'results' | 'finalScores';
export type PromptPackId = 'safe-party';

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

export interface RoomSettings {
  rounds: number;
  drawSeconds: number;
  guessSeconds: number;
  voteSeconds: number;
  promptPackId: PromptPackId;
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
  scoreDeltas: ScoreDelta[];
}

export interface ScoreEntry {
  playerId: string;
  name: string;
  score: number;
}

export interface ScoreDelta {
  playerId: string;
  name: string;
  delta: number;
}

export interface RoomSnapshot {
  roomCode: string;
  phase: GamePhase;
  players: PlayerPublic[];
  minPlayers: number;
  maxPlayers: number;
  currentRound: number;
  totalRounds: number;
  settings: RoomSettings;
  turnToken: number;
  serverNowMs: number;
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
  | { type: 'updateRoomSettings'; settings: RoomSettings }
  | { type: 'startGame' }
  | { type: 'submitDrawing'; turnToken: number; drawing: DrawingDoc }
  | { type: 'submitGuess'; turnToken: number; guess: string }
  | { type: 'submitVote'; turnToken: number; optionId: string }
  | { type: 'heartbeat' }
  | { type: 'leaveRoom' };

export type ServerMessage =
  | { type: 'roomCreated'; snapshot: RoomSnapshot; hostToken: string }
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
  switch (maybe.type) {
    case 'roomCreated':
      return (
        isRoomSnapshot((value as { snapshot?: unknown }).snapshot) &&
        typeof (value as { hostToken?: unknown }).hostToken === 'string'
      );
    case 'roomSnapshot':
    case 'phaseChanged':
      return isRoomSnapshot((value as { snapshot?: unknown }).snapshot);
    case 'promptAssigned':
      return typeof (value as { prompt?: unknown }).prompt === 'string';
    case 'playerListChanged':
      return isPlayerList((value as { players?: unknown }).players);
    case 'drawingReveal':
      return (
        typeof (value as { artistId?: unknown }).artistId === 'string' &&
        typeof (value as { artistName?: unknown }).artistName === 'string' &&
        isDrawingDoc((value as { drawing?: unknown }).drawing)
      );
    case 'votingOptions':
      return isVotingOptions((value as { options?: unknown }).options);
    case 'roundResult':
      return isRoundResult((value as { result?: unknown }).result);
    case 'finalScores':
      return isScoreEntries((value as { scores?: unknown }).scores);
    case 'pong':
      return typeof (value as { nowMs?: unknown }).nowMs === 'number';
    case 'error':
      return (
        typeof (value as { code?: unknown }).code === 'string' &&
        typeof (value as { message?: unknown }).message === 'string'
      );
    default:
      return false;
  }
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

export function defaultRoomSettings(): RoomSettings {
  return {
    rounds: 5,
    drawSeconds: 90,
    guessSeconds: 45,
    voteSeconds: 30,
    promptPackId: 'safe-party'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isGamePhase(value: unknown): value is GamePhase {
  return (
    value === 'lobby' ||
    value === 'drawing' ||
    value === 'guessing' ||
    value === 'voting' ||
    value === 'results' ||
    value === 'finalScores'
  );
}

function isRoomSettings(value: unknown): value is RoomSettings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPositiveInteger(value.rounds) &&
    isPositiveInteger(value.drawSeconds) &&
    isPositiveInteger(value.guessSeconds) &&
    isPositiveInteger(value.voteSeconds) &&
    value.promptPackId === 'safe-party'
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPlayer(value: unknown): value is PlayerPublic {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.score === 'number' &&
    typeof value.connected === 'boolean'
  );
}

function isPlayerList(value: unknown): value is PlayerPublic[] {
  return Array.isArray(value) && value.every(isPlayer);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number';
}

function isStroke(value: unknown): value is Stroke {
  return (
    isRecord(value) &&
    typeof value.color === 'string' &&
    typeof value.size === 'number' &&
    Array.isArray(value.points) &&
    value.points.every(isPoint)
  );
}

function isDrawingDoc(value: unknown): value is DrawingDoc {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStroke)
  );
}

function isVotingOption(value: unknown): value is VotingOption {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    (value.authorPlayerId === undefined || value.authorPlayerId === null || typeof value.authorPlayerId === 'string') &&
    (value.authorName === undefined || value.authorName === null || typeof value.authorName === 'string') &&
    typeof value.isCorrect === 'boolean'
  );
}

function isVotingOptions(value: unknown): value is VotingOption[] {
  return Array.isArray(value) && value.every(isVotingOption);
}

function isVoteBreakdown(value: unknown): value is VoteBreakdown {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.optionId === 'string' &&
    typeof value.optionText === 'string' &&
    isStringArray(value.voterNames) &&
    typeof value.isCorrect === 'boolean' &&
    (value.authorName === undefined || value.authorName === null || typeof value.authorName === 'string')
  );
}

function isScoreEntry(value: unknown): value is ScoreEntry {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.score === 'number'
  );
}

function isScoreDelta(value: unknown): value is ScoreDelta {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.delta === 'number'
  );
}

function isScoreEntries(value: unknown): value is ScoreEntry[] {
  return Array.isArray(value) && value.every(isScoreEntry);
}

function isScoreDeltas(value: unknown): value is ScoreDelta[] {
  return Array.isArray(value) && value.every(isScoreDelta);
}

function isRoundResult(value: unknown): value is RoundResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.artistId === 'string' &&
    typeof value.artistName === 'string' &&
    typeof value.correctAnswer === 'string' &&
    isStringArray(value.correctVoterNames) &&
    Array.isArray(value.breakdown) &&
    value.breakdown.every(isVoteBreakdown) &&
    isScoreDeltas(value.scoreDeltas)
  );
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.roomCode === 'string' &&
    isGamePhase(value.phase) &&
    isPlayerList(value.players) &&
    typeof value.minPlayers === 'number' &&
    typeof value.maxPlayers === 'number' &&
    typeof value.currentRound === 'number' &&
    typeof value.totalRounds === 'number' &&
    isRoomSettings(value.settings) &&
    typeof value.turnToken === 'number' &&
    typeof value.serverNowMs === 'number' &&
    (value.deadlineMs === undefined || value.deadlineMs === null || typeof value.deadlineMs === 'number') &&
    (value.currentArtistId === undefined || value.currentArtistId === null || typeof value.currentArtistId === 'string') &&
    (value.currentArtistName === undefined || value.currentArtistName === null || typeof value.currentArtistName === 'string') &&
    (value.currentDrawing === undefined || value.currentDrawing === null || isDrawingDoc(value.currentDrawing)) &&
    isVotingOptions(value.votingOptions) &&
    (value.roundResult === undefined || value.roundResult === null || isRoundResult(value.roundResult)) &&
    isScoreEntries(value.finalScores) &&
    isStringArray(value.drawingSubmittedIds) &&
    isStringArray(value.guessSubmittedIds) &&
    isStringArray(value.voteSubmittedIds)
  );
}
