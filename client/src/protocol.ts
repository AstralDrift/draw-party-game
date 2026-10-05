export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 768;
export const MAX_NAME_LEN = 24;

export type Role = 'display' | 'player';
export type GamePhase = 'lobby' | 'drawing' | 'guessing' | 'voting' | 'results' | 'finalScores';
export type GameMode = 'party' | 'practice';
export type PromptPackId = 'safe-party' | 'party-chaos';
export const PROMPT_PACK_OPTIONS = [
  { id: 'safe-party', label: 'Party Safe' },
  { id: 'party-chaos', label: 'Party Chaos' }
] as const satisfies ReadonlyArray<{ id: PromptPackId; label: string }>;
export const REACTION_EMOJIS = ['😂', '😱', '🔥', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

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
  spectator: boolean;
  /** First connected phone that can drive lobby settings / start / continue. */
  isHost: boolean;
}

export interface RoomSettings {
  rounds: number;
  drawSeconds: number;
  guessSeconds: number;
  voteSeconds: number;
  resultsSeconds: number;
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
  /** Additive so a just-updated client can still present results from an older server. */
  scoreEvents?: ScoreEvent[];
  nobodyFoundIt: boolean;
  perfectTruth: boolean;
}

export interface ScoreEntry {
  playerId: string;
  name: string;
  score: number;
}

export interface ResultPresentation {
  startedAtMs: number;
  tallyAtMs: number;
  spotlightAtMs: number;
  truthAtMs: number;
  scoresAtMs: number;
  continueAtMs: number;
  spotlightOptionId: string | null;
}

export type AwardKind = 'masterBluffer' | 'truthDetective' | 'picturePerfect';
export interface GameAward {
  kind: AwardKind;
  value: number;
  winners: Array<{ playerId: string; name: string }>;
}

export interface ScoreDelta {
  playerId: string;
  name: string;
  delta: number;
  /** Authoritative score after this reveal; absent on older servers. */
  scoreAfter?: number;
}

export type ScoreEventKind =
  | 'foundTruth'
  | 'artistClarity'
  | 'fooledPlayer'
  | 'nobodyFoundIt'
  | 'perfectTruth';

export interface ScoreEvent {
  kind: ScoreEventKind;
  playerId: string;
  name: string;
  points: number;
  relatedPlayerId?: string | null;
  relatedPlayerName?: string | null;
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
  /** Additive deployment-skew fields; older servers are treated as Party with no extension. */
  gameMode?: GameMode;
  deadlineExtensionAvailable?: boolean;
  deadlineMs?: number | null;
  currentArtistId?: string | null;
  currentArtistName?: string | null;
  currentDrawing?: DrawingDoc | null;
  votingOptions: VotingOption[];
  /** Per-recipient marker for a truth-matching guess whose correct vote is server-locked. */
  nailedIt?: boolean;
  roundResult?: RoundResult | null;
  resultPresentation?: ResultPresentation | null;
  gameAwards?: GameAward[];
  finalScores: ScoreEntry[];
  drawingSubmittedIds: string[];
  guessSubmittedIds: string[];
  voteSubmittedIds: string[];
}

export type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomCode: string; name: string }
  | { type: 'setName'; name: string; requestId: string }
  | { type: 'updateRoomSettings'; settings: RoomSettings }
  | { type: 'startGame' }
  | { type: 'startPractice' }
  | { type: 'extendDeadline'; turnToken: number }
  | { type: 'submitDrawing'; turnToken: number; drawing: DrawingDoc }
  | { type: 'submitGuess'; turnToken: number; guess: string }
  | { type: 'submitVote'; turnToken: number; optionId: string }
  | { type: 'sendReaction'; emoji: ReactionEmoji }
  | { type: 'heartbeat' }
  | { type: 'leaveRoom' };

export type ServerMessage =
  | { type: 'roomCreated'; snapshot: RoomSnapshot; hostToken: string }
  | { type: 'roomSnapshot'; snapshot: RoomSnapshot }
  | { type: 'phaseChanged'; snapshot: RoomSnapshot }
  | { type: 'promptAssigned'; prompt: string }
  | { type: 'playerListChanged'; players: PlayerPublic[] }
  | { type: 'nameSet'; requestId: string; canonicalName: string }
  | { type: 'drawingReveal'; artistId: string; artistName: string; drawing: DrawingDoc }
  | { type: 'votingOptions'; options: VotingOption[] }
  | { type: 'roundResult'; result: RoundResult }
  | { type: 'finalScores'; scores: ScoreEntry[] }
  | { type: 'reactionBurst'; playerId: string; name: string; emoji: ReactionEmoji; atMs: number }
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
    case 'nameSet':
      return (
        isRenameRequestId((value as { requestId?: unknown }).requestId) &&
        isCanonicalName((value as { canonicalName?: unknown }).canonicalName)
      );
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
    case 'reactionBurst':
      return isReactionBurst(value);
    case 'pong':
      return isFiniteNumber((value as { nowMs?: unknown }).nowMs);
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
    rounds: 2,
    drawSeconds: 75,
    guessSeconds: 30,
    voteSeconds: 20,
    resultsSeconds: 14,
    promptPackId: 'safe-party'
  };
}

export function isPromptPackId(value: unknown): value is PromptPackId {
  return value === 'safe-party' || value === 'party-chaos';
}

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value);
}

function isRenameRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isCanonicalName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    Array.from(value).length <= MAX_NAME_LEN
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

/** Reject NaN/Infinity so hostile payloads cannot poison clocks, scores, or coords. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

function isGameMode(value: unknown): value is GameMode {
  return value === 'party' || value === 'practice';
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
    isPositiveInteger(value.resultsSeconds) &&
    isPromptPackId(value.promptPackId)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isPlayer(value: unknown): value is PlayerPublic {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.score) &&
    typeof value.connected === 'boolean' &&
    typeof value.spectator === 'boolean' &&
    typeof value.isHost === 'boolean'
  );
}

function isPlayerList(value: unknown): value is PlayerPublic[] {
  return Array.isArray(value) && value.every(isPlayer);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isStroke(value: unknown): value is Stroke {
  return (
    isRecord(value) &&
    typeof value.color === 'string' &&
    isFiniteNumber(value.size) &&
    Array.isArray(value.points) &&
    value.points.every(isPoint)
  );
}

function isDrawingDoc(value: unknown): value is DrawingDoc {
  return (
    isRecord(value) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
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
    isFiniteNumber(value.score)
  );
}

function isScoreDelta(value: unknown): value is ScoreDelta {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.delta) &&
    (value.scoreAfter === undefined || isFiniteNumber(value.scoreAfter))
  );
}

function isScoreEventKind(value: unknown): value is ScoreEventKind {
  return (
    value === 'foundTruth' ||
    value === 'artistClarity' ||
    value === 'fooledPlayer' ||
    value === 'nobodyFoundIt' ||
    value === 'perfectTruth'
  );
}

function isScoreEvent(value: unknown): value is ScoreEvent {
  return (
    isRecord(value) &&
    isScoreEventKind(value.kind) &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.points) &&
    (value.relatedPlayerId === undefined ||
      value.relatedPlayerId === null ||
      typeof value.relatedPlayerId === 'string') &&
    (value.relatedPlayerName === undefined ||
      value.relatedPlayerName === null ||
      typeof value.relatedPlayerName === 'string')
  );
}

function isScoreEvents(value: unknown): value is ScoreEvent[] {
  return Array.isArray(value) && value.every(isScoreEvent);
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
    isScoreDeltas(value.scoreDeltas) &&
    (value.scoreEvents === undefined || isScoreEvents(value.scoreEvents)) &&
    typeof value.nobodyFoundIt === 'boolean' &&
    typeof value.perfectTruth === 'boolean'
  );
}

function isResultPresentation(value: unknown): value is ResultPresentation {
  if (!isRecord(value)) return false;
  const times = [value.startedAtMs, value.tallyAtMs, value.spotlightAtMs,
    value.truthAtMs, value.scoresAtMs, value.continueAtMs];
  return times.every((time, index) =>
    typeof time === 'number' && Number.isSafeInteger(time) && time >= 0 &&
    (index === 0 || time >= (times[index - 1] as number))) &&
    (value.spotlightOptionId === null || typeof value.spotlightOptionId === 'string');
}

function isGameAwards(value: unknown): value is GameAward[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const kinds = new Set<string>();
  return value.every((award) => {
    if (!isRecord(award) ||
      !['masterBluffer', 'truthDetective', 'picturePerfect'].includes(award.kind as string) ||
      kinds.has(award.kind as string) || !Number.isSafeInteger(award.value) ||
      (award.value as number) <= 0 || !Array.isArray(award.winners) || !award.winners.length) return false;
    kinds.add(award.kind as string);
    const winners = new Set<string>();
    return award.winners.every((winner) => {
      if (!isRecord(winner) || typeof winner.playerId !== 'string' ||
        typeof winner.name !== 'string' || winners.has(winner.playerId)) return false;
      winners.add(winner.playerId);
      return true;
    });
  });
}

function validPresentationInSnapshot(value: Record<string, unknown>): boolean {
  const show = value.resultPresentation;
  if (show === undefined || show === null) return true;
  if (!isResultPresentation(show) || value.phase !== 'results' || !isRoundResult(value.roundResult)) return false;
  if (typeof value.deadlineMs === 'number' && show.continueAtMs > value.deadlineMs) return false;
  return show.spotlightOptionId === null || value.roundResult.breakdown.some((option) =>
    option.optionId === show.spotlightOptionId && !option.isCorrect && option.voterNames.length > 0);
}

function isReactionBurst(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    isReactionEmoji(value.emoji) &&
    isFiniteNumber(value.atMs)
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
    isFiniteNumber(value.minPlayers) &&
    isFiniteNumber(value.maxPlayers) &&
    isFiniteNumber(value.currentRound) &&
    isFiniteNumber(value.totalRounds) &&
    isRoomSettings(value.settings) &&
    isFiniteNumber(value.turnToken) &&
    isFiniteNumber(value.serverNowMs) &&
    (value.gameMode === undefined || isGameMode(value.gameMode)) &&
    (value.deadlineExtensionAvailable === undefined ||
      typeof value.deadlineExtensionAvailable === 'boolean') &&
    (value.deadlineMs === undefined ||
      value.deadlineMs === null ||
      isFiniteNumber(value.deadlineMs)) &&
    (value.currentArtistId === undefined || value.currentArtistId === null || typeof value.currentArtistId === 'string') &&
    (value.currentArtistName === undefined || value.currentArtistName === null || typeof value.currentArtistName === 'string') &&
    (value.currentDrawing === undefined || value.currentDrawing === null || isDrawingDoc(value.currentDrawing)) &&
    isVotingOptions(value.votingOptions) &&
    (value.nailedIt === undefined || typeof value.nailedIt === 'boolean') &&
    (value.roundResult === undefined || value.roundResult === null || isRoundResult(value.roundResult)) &&
    validPresentationInSnapshot(value) &&
    (value.gameAwards === undefined || isGameAwards(value.gameAwards)) &&
    isScoreEntries(value.finalScores) &&
    isStringArray(value.drawingSubmittedIds) &&
    isStringArray(value.guessSubmittedIds) &&
    isStringArray(value.voteSubmittedIds)
  );
}
