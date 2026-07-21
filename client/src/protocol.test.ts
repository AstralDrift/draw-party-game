import { describe, expect, it } from 'vitest';
import {
  defaultRoomSettings,
  isPromptPackId,
  isReactionEmoji,
  isServerMessage,
  phaseLabel,
  type ClientMessage,
  type GamePhase,
  type RoomSnapshot
} from './protocol';

function baseSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'lobby',
    players: [],
    minPlayers: 1,
    maxPlayers: 8,
    currentRound: 0,
    totalRounds: 2,
    settings: defaultRoomSettings(),
    turnToken: 0,
    serverNowMs: 123,
    gameMode: 'party',
    deadlineExtensionAvailable: false,
    deadlineMs: null,
    currentArtistId: null,
    currentArtistName: null,
    currentDrawing: null,
    votingOptions: [],
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: [],
    guessSubmittedIds: [],
    voteSubmittedIds: [],
    ...overrides
  };
}

const validDrawing = {
  width: 1024,
  height: 768,
  strokes: [{ color: '#111111', size: 6, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }]
};

const validRoundResult = {
  artistId: 'p1',
  artistName: 'Ada',
  correctAnswer: 'a cat',
  correctVoterNames: ['Bo'],
  breakdown: [
    {
      optionId: 'option-0',
      optionText: 'a cat',
      voterNames: ['Bo'],
      isCorrect: true,
      authorName: null
    }
  ],
  scoreDeltas: [{ playerId: 'p1', name: 'Ada', delta: 100, scoreAfter: 300 }],
  scoreEvents: [
    {
      kind: 'artistClarity',
      playerId: 'p1',
      name: 'Ada',
      points: 100,
      relatedPlayerId: 'p2',
      relatedPlayerName: 'Bo'
    }
  ],
  nobodyFoundIt: false,
  perfectTruth: false
};

describe('protocol helpers', () => {
  it('binds deadline extensions to the requested turn', () => {
    const message = {
      type: 'extendDeadline',
      turnToken: 42
    } satisfies Extract<ClientMessage, { type: 'extendDeadline' }>;

    expect(JSON.parse(JSON.stringify(message))).toEqual({
      type: 'extendDeadline',
      turnToken: 42
    });
  });

  it('recognizes valid server messages across types', () => {
    const snapshot = baseSnapshot();
    expect(isServerMessage({ type: 'pong', nowMs: 123 })).toBe(true);
    expect(isServerMessage({ type: 'roomSnapshot', snapshot })).toBe(true);
    expect(isServerMessage({ type: 'phaseChanged', snapshot })).toBe(true);
    expect(isServerMessage({ type: 'roomCreated', snapshot, hostToken: 'host' })).toBe(true);
    expect(isServerMessage({ type: 'promptAssigned', prompt: '' })).toBe(true);
    expect(
      isServerMessage({
        type: 'playerListChanged',
        players: [{ id: 'a', name: 'A', score: 0, connected: true, spectator: false, isHost: true }]
      })
    ).toBe(true);
    expect(
      isServerMessage({
        type: 'drawingReveal',
        artistId: 'a',
        artistName: 'A',
        drawing: validDrawing
      })
    ).toBe(true);
    expect(
      isServerMessage({
        type: 'votingOptions',
        options: [{ id: 'o1', text: 'x', isCorrect: false }]
      })
    ).toBe(true);
    expect(isServerMessage({ type: 'roundResult', result: validRoundResult })).toBe(true);
    expect(
      isServerMessage({
        type: 'finalScores',
        scores: [{ playerId: 'a', name: 'A', score: 10 }]
      })
    ).toBe(true);
    expect(
      isServerMessage({
        type: 'reactionBurst',
        playerId: 'p',
        name: 'A',
        emoji: '😂',
        atMs: 1
      })
    ).toBe(true);
    expect(isServerMessage({ type: 'error', code: 'x', message: 'y' })).toBe(true);
  });

  it('rejects malformed and hostile numeric payloads', () => {
    expect(isServerMessage({ type: 'pong', nowMs: '123' })).toBe(false);
    expect(isServerMessage({ type: 'pong', nowMs: Number.NaN })).toBe(false);
    expect(isServerMessage({ type: 'pong', nowMs: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isServerMessage({ type: 'roomSnapshot', snapshot: { phase: 'lobby' } })).toBe(false);
    expect(isServerMessage({ type: 'roomCreated', snapshot: baseSnapshot(), hostToken: 1 })).toBe(
      false
    );
    expect(isServerMessage({ type: 'unknown' })).toBe(false);
    expect(isServerMessage({ nowMs: 123 })).toBe(false);
    expect(isServerMessage(null)).toBe(false);
    expect(isServerMessage(undefined)).toBe(false);
    expect(isServerMessage([])).toBe(false);
    expect(isServerMessage({ type: 'error', code: 'x', message: 1 })).toBe(false);
    expect(isServerMessage({ type: 'promptAssigned', prompt: null })).toBe(false);
    expect(
      isServerMessage({
        type: 'reactionBurst',
        playerId: 'p',
        name: 'A',
        emoji: '🙂',
        atMs: 1
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'reactionBurst',
        playerId: 'p',
        name: 'A',
        emoji: '😂',
        atMs: Number.NaN
      })
    ).toBe(false);
  });

  it('rejects poisoned snapshots and nested drawings', () => {
    const base = baseSnapshot();
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, settings: { ...base.settings, rounds: 0 } }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, gameMode: 'ranked' }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, deadlineExtensionAvailable: 'yes' }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: {
          ...base,
          players: [{ id: 'a', name: 'A', score: 0, connected: true }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, drawingSubmittedIds: [1 as unknown as string] }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, deadlineMs: '100' }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: { ...base, serverNowMs: Number.NaN }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: {
          ...base,
          players: [{ id: 'a', name: 'A', score: Number.NaN, connected: true, spectator: false }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'drawingReveal',
        artistId: 'a',
        artistName: 'A',
        drawing: {
          width: 1024,
          height: 768,
          strokes: [{ color: '#111', size: 6, points: [{ x: '0' as unknown as number, y: 0 }] }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'drawingReveal',
        artistId: 'a',
        artistName: 'A',
        drawing: {
          width: Number.POSITIVE_INFINITY,
          height: 768,
          strokes: []
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roundResult',
        result: { ...validRoundResult, scoreDeltas: undefined }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roundResult',
        result: {
          ...validRoundResult,
          scoreDeltas: [{ playerId: 'p1', name: 'Ada', delta: 100, scoreAfter: Number.NaN }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roundResult',
        result: {
          ...validRoundResult,
          scoreEvents: [{ ...validRoundResult.scoreEvents[0], kind: 'madeUp' }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roundResult',
        result: {
          ...validRoundResult,
          scoreEvents: [{ ...validRoundResult.scoreEvents[0], points: Number.POSITIVE_INFINITY }]
        }
      })
    ).toBe(false);
    expect(
      isServerMessage({
        type: 'roundResult',
        result: {
          ...validRoundResult,
          scoreEvents: [{ ...validRoundResult.scoreEvents[0], relatedPlayerName: 2 }]
        }
      })
    ).toBe(false);
  });

  it('accepts older server snapshots and round results without additive fields', () => {
    const snapshot = baseSnapshot();
    delete snapshot.gameMode;
    delete snapshot.deadlineExtensionAvailable;
    const legacyResult = {
      ...validRoundResult,
      scoreDeltas: validRoundResult.scoreDeltas.map(({ scoreAfter: _scoreAfter, ...delta }) => delta)
    };
    delete (legacyResult as Partial<typeof legacyResult>).scoreEvents;

    expect(isServerMessage({ type: 'roomSnapshot', snapshot })).toBe(true);
    expect(isServerMessage({ type: 'roundResult', result: legacyResult })).toBe(true);
  });

  it('labels every phase and validates pack/emoji helpers', () => {
    const labels: Record<GamePhase, string> = {
      lobby: 'Lobby',
      drawing: 'Drawing',
      guessing: 'Guessing',
      voting: 'Voting',
      results: 'Results',
      finalScores: 'Final Scores'
    };
    for (const [phase, label] of Object.entries(labels) as Array<[GamePhase, string]>) {
      expect(phaseLabel(phase)).toBe(label);
    }
    expect(isPromptPackId('safe-party')).toBe(true);
    expect(isPromptPackId('party-chaos')).toBe(true);
    expect(isPromptPackId('other')).toBe(false);
    expect(isReactionEmoji('🔥')).toBe(true);
    expect(isReactionEmoji('🙂')).toBe(false);
    expect(defaultRoomSettings()).toEqual({
      rounds: 2,
      drawSeconds: 75,
      guessSeconds: 30,
      voteSeconds: 20,
      resultsSeconds: 8,
      promptPackId: 'safe-party'
    });
  });
});
