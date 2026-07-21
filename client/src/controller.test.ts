import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeDuplicateSubmission,
  coalescePendingRenameIntent,
  createPendingRenameIntent,
  deadlineExtensionResolution,
  finalReplayPlan,
  markPendingRenameSent,
  pendingRenameDesiredName,
  reconcilePendingRenameAcknowledgement,
  reconcilePendingRenameSnapshot,
  playerActionAlert,
  playerNeedsAction,
  playerSubmissionAccepted,
  queuePendingRenameAfterDisconnect,
  reconcilePendingSubmission,
  retryPendingSubmission,
  scheduleSubmissionWatchdog,
  shouldResetPendingServerAction,
  SUBMISSION_WATCHDOG_MS,
  supportsPracticeMode,
  voteOptionAccessibleName,
  type PendingRenameIntent,
  type PendingSubmission
} from './controller';
import { defaultRoomSettings, type RoomSnapshot } from './protocol';

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    gameMode: 'party',
    players: [
      {
        id: 'p1',
        name: 'Ava',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      },
      {
        id: 'p2',
        name: 'Bo',
        score: 0,
        connected: true,
        spectator: false,
        isHost: false
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    currentRound: 1,
    totalRounds: 2,
    settings: defaultRoomSettings(),
    turnToken: 3,
    serverNowMs: 1000,
    deadlineMs: 61_000,
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

describe('playerNeedsAction', () => {
  it('requires an active connected player who has not submitted', () => {
    expect(playerNeedsAction(snapshot(), 'p1')).toBe(true);
    expect(playerNeedsAction(snapshot({ drawingSubmittedIds: ['p1'] }), 'p1')).toBe(false);
    expect(
      playerNeedsAction(
        snapshot({ players: [{ ...snapshot().players[0]!, connected: false }] }),
        'p1'
      )
    ).toBe(false);
    expect(
      playerNeedsAction(
        snapshot({ players: [{ ...snapshot().players[0]!, spectator: true }] }),
        'p1'
      )
    ).toBe(false);
  });

  it('does not alert the artist during guessing or voting', () => {
    expect(
      playerNeedsAction(snapshot({ phase: 'guessing', currentArtistId: 'p1' }), 'p1')
    ).toBe(false);
    expect(
      playerNeedsAction(snapshot({ phase: 'voting', currentArtistId: 'p1' }), 'p1')
    ).toBe(false);
    expect(
      playerNeedsAction(snapshot({ phase: 'guessing', currentArtistId: 'p2' }), 'p1')
    ).toBe(true);
    expect(
      playerNeedsAction(
        snapshot({ phase: 'voting', currentArtistId: 'p2', voteSubmittedIds: ['p1'] }),
        'p1'
      )
    ).toBe(false);
  });

  it('keeps haptic alerts independent from the sound preference and deduplicates turns', () => {
    const mutedAlert = playerActionAlert(snapshot(), 'p1', '', false);
    expect(mutedAlert).toEqual({
      key: 'ABCD:drawing:3',
      playSound: false,
      haptic: true
    });
    expect(playerActionAlert(snapshot(), 'p1', mutedAlert?.key ?? '', false)).toBeNull();
    expect(playerActionAlert(snapshot(), 'p1', '', true)?.playSound).toBe(true);
  });
});

describe('protocol capabilities', () => {
  it('only offers Practice when the server snapshot advertises game-mode support', () => {
    expect(supportsPracticeMode(snapshot())).toBe(true);
    const legacySnapshot = snapshot();
    delete legacySnapshot.gameMode;
    expect(supportsPracticeMode(legacySnapshot)).toBe(false);
  });
});

describe('final replay plan', () => {
  const thirdPlayer = {
    id: 'p3',
    name: 'Cy',
    score: 0,
    connected: true,
    spectator: true,
    isHost: false
  };

  it('counts every connected final seat and gracefully switches modes', () => {
    expect(finalReplayPlan(snapshot({ phase: 'finalScores' }))).toMatchObject({
      action: null,
      connectedCount: 2,
      guidance: 'Invite one more for Party, or leave one phone connected for Practice.'
    });
    expect(
      finalReplayPlan(
        snapshot({ phase: 'finalScores', players: [...snapshot().players, thirdPlayer] })
      )
    ).toMatchObject({ action: 'party', label: 'Play Again', connectedCount: 3 });
    expect(
      finalReplayPlan(
        snapshot({
          phase: 'finalScores',
          gameMode: 'practice',
          players: [...snapshot().players, thirdPlayer]
        })
      )
    ).toMatchObject({ action: 'party', label: 'Start Party' });
  });

  it('offers Practice to one phone while protecting legacy servers', () => {
    const onePhone = [snapshot().players[0]!];
    expect(finalReplayPlan(snapshot({ phase: 'finalScores', players: onePhone }))).toMatchObject({
      action: 'practice',
      label: 'Practice Drawing'
    });
    expect(
      finalReplayPlan(
        snapshot({ phase: 'finalScores', gameMode: 'practice', players: onePhone })
      )
    ).toMatchObject({ action: 'practice', label: 'Practice Again' });

    const legacy = snapshot({ phase: 'finalScores', players: onePhone });
    delete legacy.gameMode;
    expect(finalReplayPlan(legacy)).toMatchObject({ action: null, connectedCount: 1 });
  });
});

describe('deadline extension request', () => {
  it('distinguishes pending, confirmed, retryable, and stale outcomes', () => {
    const current = { turnToken: 3, deadlineExtensionAvailable: true };
    expect(deadlineExtensionResolution(3, current, false, 'Connected', '')).toBe('pending');
    expect(
      deadlineExtensionResolution(
        3,
        { ...current, deadlineExtensionAvailable: false },
        true,
        'Connected',
        ''
      )
    ).toBe('confirmed');
    expect(deadlineExtensionResolution(3, current, true, 'Connected', '')).toBe('retry');
    expect(deadlineExtensionResolution(3, current, false, 'Disconnected', '')).toBe('retry');
    expect(deadlineExtensionResolution(3, current, false, 'Connected', 'Rejected')).toBe('retry');
    expect(deadlineExtensionResolution(3, { ...current, turnToken: 4 }, true, 'Connected', '')).toBe(
      'stale'
    );
  });
});

describe('recoverable server actions', () => {
  it('re-enables a pending CTA after errors, disconnects, or eligibility changes', () => {
    expect(shouldResetPendingServerAction(true, 'Connected', '')).toBe(false);
    expect(shouldResetPendingServerAction(true, 'Connected', 'Rejected')).toBe(true);
    expect(shouldResetPendingServerAction(true, 'Disconnected', '')).toBe(true);
    expect(shouldResetPendingServerAction(true, 'Connected', '', false)).toBe(true);
    expect(shouldResetPendingServerAction(false, 'Disconnected', 'Rejected', false)).toBe(false);
  });
});

describe('vote option accessible names', () => {
  it('announces only player-safe ownership and selection state', () => {
    expect(
      voteOptionAccessibleName('B', 'Moon dentist', {
        ownGuess: true,
        selected: false,
        sending: false,
        retrying: false,
        submitted: false
      })
    ).toBe('Option B: Moon dentist. Your fake answer');
    expect(
      voteOptionAccessibleName('C', 'Tiny volcano', {
        ownGuess: false,
        selected: true,
        sending: false,
        retrying: true,
        submitted: false
      })
    ).toBe('Option C: Tiny volcano. Selected vote. Not accepted; tap again to retry');
    expect(
      voteOptionAccessibleName('A', 'Secret truth', {
        ownGuess: false,
        selected: true,
        sending: false,
        retrying: false,
        submitted: true
      })
    ).toBe('Option A: Secret truth. Selected vote. Vote locked');
  });
});

describe('pending submission reconciliation', () => {
  const pending: PendingSubmission = {
    kind: 'vote',
    turnToken: 3,
    optionId: 'option-2',
    state: 'sending'
  };

  it('moves from sending to accepted only after the authoritative snapshot', () => {
    const unconfirmed = reconcilePendingSubmission(
      pending,
      snapshot({ phase: 'voting', currentArtistId: 'p2' }),
      'p1'
    );
    expect(unconfirmed).toEqual({ next: pending, newlyAccepted: false });

    const confirmed = reconcilePendingSubmission(
      pending,
      snapshot({ phase: 'voting', currentArtistId: 'p2', voteSubmittedIds: ['p1'] }),
      'p1'
    );
    expect(confirmed).toEqual({
      next: { ...pending, state: 'accepted' },
      newlyAccepted: true
    });

    expect(
      reconcilePendingSubmission(confirmed.next, snapshot({ phase: 'voting', voteSubmittedIds: ['p1'] }), 'p1')
        .newlyAccepted
    ).toBe(false);
  });

  it('discards an unacknowledged stale turn but still recognizes a last-action ack', () => {
    expect(
      reconcilePendingSubmission(pending, snapshot({ phase: 'results', turnToken: 4 }), 'p1')
    ).toEqual({ next: null, newlyAccepted: false });
    expect(
      reconcilePendingSubmission(
        pending,
        snapshot({ phase: 'results', turnToken: 4, voteSubmittedIds: ['p1'] }),
        'p1'
      )
    ).toEqual({ next: null, newlyAccepted: true });
  });

  it('keeps the selected option while making an interrupted send retryable', () => {
    expect(retryPendingSubmission(pending)).toEqual({ ...pending, state: 'retry' });
  });

  it('treats a duplicate response as an ack only for the current phase and turn', () => {
    expect(
      acknowledgeDuplicateSubmission(
        { ...pending, state: 'retry' },
        snapshot({ phase: 'voting', currentArtistId: 'p2' })
      )
    ).toEqual({
      next: { ...pending, state: 'accepted' },
      newlyAccepted: true
    });
    expect(
      acknowledgeDuplicateSubmission(
        { ...pending, state: 'retry' },
        snapshot({ phase: 'voting', turnToken: 4, currentArtistId: 'p2' })
      )
    ).toEqual({ next: { ...pending, state: 'retry' }, newlyAccepted: false });
    expect(
      acknowledgeDuplicateSubmission(
        { ...pending, state: 'retry' },
        snapshot({ phase: 'results', turnToken: 3 })
      )
    ).toEqual({ next: { ...pending, state: 'retry' }, newlyAccepted: false });
  });

  it('renders a current-turn duplicate ack as submitted before the next snapshot', () => {
    const duplicateAck: PendingSubmission = {
      ...pending,
      state: 'accepted'
    };
    expect(
      playerSubmissionAccepted(
        snapshot({ phase: 'voting', currentArtistId: 'p2' }),
        'p1',
        'vote',
        duplicateAck
      )
    ).toBe(true);
    expect(
      playerSubmissionAccepted(
        snapshot({ phase: 'voting', turnToken: 4, currentArtistId: 'p2' }),
        'p1',
        'vote',
        duplicateAck
      )
    ).toBe(false);
    expect(
      playerSubmissionAccepted(
        snapshot({ phase: 'voting', currentArtistId: 'p2', voteSubmittedIds: ['p1'] }),
        'p1',
        'vote',
        null
      )
    ).toBe(true);
  });
});

describe('pending rename reconciliation', () => {
  const BOB_REQUEST = '11111111-1111-4111-8111-111111111111';
  const CAROL_REQUEST = '22222222-2222-4222-8222-222222222222';

  it('keeps an unchanged-canonical collision pending until the matching acknowledgement', () => {
    const intent = createPendingRenameIntent('Bob', 'Bob 2', true, 4, BOB_REQUEST);
    expect(reconcilePendingRenameSnapshot(intent, 5, 'Bob 2', CAROL_REQUEST)).toEqual({
      next: intent,
      sendName: null
    });
    expect(
      reconcilePendingRenameAcknowledgement(
        intent,
        BOB_REQUEST,
        'Bob 2',
        6,
        CAROL_REQUEST
      )
    ).toEqual({
      next: null,
      sendName: null,
      matched: true
    });
  });

  it('uses a later changed snapshot as a compatibility acknowledgement for legacy servers', () => {
    const intent = createPendingRenameIntent('Avery', 'Ava', true, 4, BOB_REQUEST);
    expect(reconcilePendingRenameSnapshot(intent, 4, 'Ava', CAROL_REQUEST)).toEqual({
      next: intent,
      sendName: null
    });
    expect(reconcilePendingRenameSnapshot(intent, 5, 'Ava', CAROL_REQUEST)).toEqual({
      next: intent,
      sendName: null
    });
    expect(reconcilePendingRenameSnapshot(intent, 6, 'Avery 2', CAROL_REQUEST)).toEqual({
      next: null,
      sendName: null
    });

    const noOp = createPendingRenameIntent('Ava', 'Ava', true, 4, BOB_REQUEST);
    expect(reconcilePendingRenameSnapshot(noOp, 5, 'Ava', CAROL_REQUEST)).toEqual({
      next: null,
      sendName: null
    });
  });

  it('resends after rejoin and accepts the server-disambiguated canonical result', () => {
    const queued = createPendingRenameIntent('Avery', 'Ava', false, 4, BOB_REQUEST);
    expect(reconcilePendingRenameSnapshot(queued, 5, 'Ava', CAROL_REQUEST)).toEqual({
      next: queued,
      sendName: 'Avery'
    });

    const sent = markPendingRenameSent(queued, 5);
    expect(reconcilePendingRenameSnapshot(sent, 5, 'Ava', CAROL_REQUEST)).toEqual({
      next: sent,
      sendName: null
    });
    expect(
      reconcilePendingRenameAcknowledgement(
        sent,
        BOB_REQUEST,
        'Avery 2',
        6,
        CAROL_REQUEST
      )
    ).toEqual({ next: null, sendName: null, matched: true });
    expect(reconcilePendingRenameSnapshot(null, 7, 'Avery 2', CAROL_REQUEST)).toEqual({
      next: null,
      sendName: null
    });
  });

  it('accepts a collision acknowledgement even when the canonical name did not change', () => {
    const collision = createPendingRenameIntent('Bob', 'Bob 2', true, 4, BOB_REQUEST);
    expect(
      reconcilePendingRenameAcknowledgement(
        collision,
        BOB_REQUEST,
        'Bob 2',
        5,
        CAROL_REQUEST
      )
    ).toEqual({ next: null, sendName: null, matched: true });
  });

  it('serializes rapid renames so the older response starts, but cannot acknowledge, the latest name', () => {
    const bob = createPendingRenameIntent('Bob', 'Ava', true, 4, BOB_REQUEST);
    const bobThenCarol = coalescePendingRenameIntent(bob, 'Carol');

    expect(pendingRenameDesiredName(bobThenCarol)).toBe('Carol');
    const afterBobResponse = reconcilePendingRenameAcknowledgement(
      bobThenCarol,
      BOB_REQUEST,
      'Bob',
      5,
      CAROL_REQUEST
    );
    expect(afterBobResponse).toEqual({
      next: createPendingRenameIntent('Carol', 'Bob', false, 5, CAROL_REQUEST),
      sendName: 'Carol',
      matched: true
    });

    const carolSent = markPendingRenameSent(afterBobResponse.next!, 5);
    expect(queuePendingRenameAfterDisconnect(carolSent)).toEqual(
      createPendingRenameIntent('Carol', 'Bob', false, 5, CAROL_REQUEST)
    );

    expect(
      reconcilePendingRenameAcknowledgement(
        carolSent,
        BOB_REQUEST,
        'Bob',
        6,
        '33333333-3333-4333-8333-333333333333'
      )
    ).toEqual({ next: carolSent, sendName: null, matched: false });

    expect(
      reconcilePendingRenameAcknowledgement(
        null,
        BOB_REQUEST,
        'Bob',
        7,
        '44444444-4444-4444-8444-444444444444'
      )
    ).toEqual({ next: null, sendName: null, matched: false });
  });

  it('requeues an uncertain sent rename after disconnect without changing its request correlation', () => {
    const sent: PendingRenameIntent = createPendingRenameIntent(
      'Avery',
      'Ava',
      true,
      4,
      BOB_REQUEST
    );
    expect(queuePendingRenameAfterDisconnect(sent)).toEqual({
      requestId: BOB_REQUEST,
      requestedName: 'Avery',
      canonicalNameAtRequest: 'Ava',
      state: 'queued',
      sentAfterSnapshotRevision: null,
      latestRequestedName: null
    });
    expect(queuePendingRenameAfterDisconnect(null)).toBeNull();
  });
});

describe('pending submission watchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires a matching sending action after five seconds', () => {
    vi.useFakeTimers();
    const current: PendingSubmission = {
      kind: 'guess',
      turnToken: 8,
      state: 'sending'
    };
    const onExpire = vi.fn();
    scheduleSubmissionWatchdog(current, () => current, onExpire);

    vi.advanceTimersByTime(SUBMISSION_WATCHDOG_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('does not expire an accepted, retryable, stale, or cancelled action', () => {
    vi.useFakeTimers();
    let current: PendingSubmission | null = {
      kind: 'vote',
      turnToken: 9,
      state: 'sending'
    };
    const onExpire = vi.fn();
    scheduleSubmissionWatchdog(current, () => current, onExpire);
    current = { ...current, state: 'retry' };
    vi.advanceTimersByTime(SUBMISSION_WATCHDOG_MS);
    expect(onExpire).not.toHaveBeenCalled();

    current = { kind: 'vote', turnToken: 9, state: 'sending' };
    scheduleSubmissionWatchdog(current, () => current, onExpire);
    current = { ...current, state: 'accepted' };
    vi.advanceTimersByTime(SUBMISSION_WATCHDOG_MS);
    expect(onExpire).not.toHaveBeenCalled();

    current = { kind: 'vote', turnToken: 9, state: 'sending' };
    scheduleSubmissionWatchdog(current, () => current, onExpire);
    current = { kind: 'vote', turnToken: 10, state: 'sending' };
    vi.advanceTimersByTime(SUBMISSION_WATCHDOG_MS);
    expect(onExpire).not.toHaveBeenCalled();

    const cancel = scheduleSubmissionWatchdog(
      { kind: 'vote', turnToken: 10 },
      () => current,
      onExpire
    );
    cancel();
    vi.advanceTimersByTime(SUBMISSION_WATCHDOG_MS);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
