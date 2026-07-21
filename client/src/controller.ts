import type { ClientMessage, GamePhase, RoomSnapshot } from './protocol';

export const PARTY_MIN_PLAYERS = 3;

export function supportsPracticeMode(
  snapshot: Pick<RoomSnapshot, 'gameMode'>
): boolean {
  return snapshot.gameMode !== undefined;
}

export type ReplayAction = 'party' | 'practice';

export interface FinalReplayPlan {
  action: ReplayAction | null;
  label: string;
  guidance: string;
  connectedCount: number;
}

export function finalReplayPlan(snapshot: RoomSnapshot): FinalReplayPlan {
  const connectedCount = snapshot.players.filter((player) => player.connected).length;
  const previousPractice = snapshot.gameMode === 'practice';
  const practiceSupported = supportsPracticeMode(snapshot);

  if (connectedCount >= PARTY_MIN_PLAYERS) {
    return {
      action: 'party',
      label: previousPractice ? 'Start Party' : 'Play Again',
      guidance: `${connectedCount} connected phones will play Party.`,
      connectedCount
    };
  }

  if (connectedCount === 1 && practiceSupported) {
    return {
      action: 'practice',
      label: previousPractice ? 'Practice Again' : 'Practice Drawing',
      guidance: 'One connected phone is ready for score-free Practice.',
      connectedCount
    };
  }

  if (connectedCount === 2 && practiceSupported) {
    return {
      action: null,
      label: previousPractice ? 'Practice Again' : 'Play Again',
      guidance: 'Invite one more for Party, or leave one phone connected for Practice.',
      connectedCount
    };
  }

  const phonesNeeded = Math.max(0, PARTY_MIN_PLAYERS - connectedCount);
  return {
    action: null,
    label: previousPractice ? 'Practice Again' : 'Play Again',
    guidance: practiceSupported
      ? 'Reconnect one phone for Practice, or three for Party.'
      : `Reconnect ${phonesNeeded} more ${phonesNeeded === 1 ? 'phone' : 'phones'} for Party.`,
    connectedCount
  };
}

export type DeadlineExtensionResolution =
  | 'idle'
  | 'pending'
  | 'retry'
  | 'confirmed'
  | 'stale';

export function deadlineExtensionResolution(
  requestedTurn: number | null,
  snapshot: Pick<RoomSnapshot, 'turnToken' | 'deadlineExtensionAvailable'> | null,
  authoritativeSnapshotChanged: boolean,
  connectionStatus: string,
  errorMessage: string
): DeadlineExtensionResolution {
  if (requestedTurn === null) {
    return 'idle';
  }
  if (!snapshot || snapshot.turnToken !== requestedTurn) {
    return 'stale';
  }
  if (connectionStatus !== 'Connected' || errorMessage.trim()) {
    return 'retry';
  }
  if (!authoritativeSnapshotChanged) {
    return 'pending';
  }
  return snapshot.deadlineExtensionAvailable === false ? 'confirmed' : 'retry';
}

export function shouldResetPendingServerAction(
  pending: boolean,
  connectionStatus: string,
  errorMessage: string,
  actionStillValid = true
): boolean {
  return (
    pending &&
    (connectionStatus !== 'Connected' || Boolean(errorMessage.trim()) || !actionStillValid)
  );
}

interface VoteOptionAccessibleState {
  ownGuess: boolean;
  selected: boolean;
  sending: boolean;
  retrying: boolean;
  submitted: boolean;
}

export function voteOptionAccessibleName(
  label: string,
  text: string,
  state: VoteOptionAccessibleState
): string {
  const parts = [`Option ${label}: ${text}`];
  if (state.ownGuess) {
    parts.push('Your fake answer');
  } else if (state.selected) {
    parts.push('Selected vote');
    if (state.sending) {
      parts.push('Sending');
    } else if (state.retrying) {
      parts.push('Not accepted; tap again to retry');
    } else if (state.submitted) {
      parts.push('Vote locked');
    }
  } else if (state.submitted) {
    parts.push('Vote already submitted');
  }
  return parts.join('. ');
}

export type SubmissionKind = 'drawing' | 'guess' | 'vote';
export type SubmissionMessage = Extract<
  ClientMessage,
  { type: 'submitDrawing' | 'submitGuess' | 'submitVote' }
>;
export type SubmissionState = 'sending' | 'retry' | 'accepted';

export interface PendingSubmission {
  kind: SubmissionKind;
  turnToken: number;
  state: SubmissionState;
  optionId?: string;
}

export const SUBMISSION_WATCHDOG_MS = 5000;

export interface PendingRenameIntent {
  requestedName: string;
  canonicalNameAtRequest: string;
  state: 'queued' | 'sent';
  sentAfterSnapshotRevision: number | null;
  latestRequestedName: string | null;
}

export interface PendingRenameSnapshotResolution {
  next: PendingRenameIntent | null;
  sendName: string | null;
}

export function createPendingRenameIntent(
  requestedName: string,
  canonicalNameAtRequest: string,
  sent: boolean,
  snapshotRevision: number
): PendingRenameIntent {
  return {
    requestedName,
    canonicalNameAtRequest,
    state: sent ? 'sent' : 'queued',
    sentAfterSnapshotRevision: sent ? snapshotRevision : null,
    latestRequestedName: null
  };
}

/** Keeps one rename in flight while coalescing repeated saves to the latest desired name. */
export function coalescePendingRenameIntent(
  intent: PendingRenameIntent,
  requestedName: string
): PendingRenameIntent {
  if (intent.state === 'queued') {
    return {
      ...intent,
      requestedName,
      latestRequestedName: null
    };
  }
  return {
    ...intent,
    latestRequestedName: requestedName === intent.requestedName ? null : requestedName
  };
}

export function pendingRenameDesiredName(intent: PendingRenameIntent): string {
  return intent.latestRequestedName ?? intent.requestedName;
}

export function queuePendingRenameAfterDisconnect(
  intent: PendingRenameIntent | null
): PendingRenameIntent | null {
  if (!intent) {
    return null;
  }
  return {
    ...intent,
    requestedName: pendingRenameDesiredName(intent),
    state: 'queued',
    sentAfterSnapshotRevision: null,
    latestRequestedName: null
  };
}

export function markPendingRenameSent(
  intent: PendingRenameIntent,
  snapshotRevision: number
): PendingRenameIntent {
  return {
    ...intent,
    state: 'sent',
    sentAfterSnapshotRevision: snapshotRevision
  };
}

export function reconcilePendingRenameSnapshot(
  intent: PendingRenameIntent | null,
  snapshotRevision: number,
  canonicalName: string
): PendingRenameSnapshotResolution {
  if (!intent) {
    return { next: null, sendName: null };
  }
  if (intent.state === 'queued') {
    return { next: intent, sendName: intent.requestedName };
  }
  const isLaterSnapshot =
    intent.sentAfterSnapshotRevision !== null &&
    snapshotRevision > intent.sentAfterSnapshotRevision;
  const isNoOp = intent.requestedName === intent.canonicalNameAtRequest;
  const canonicalNameChanged = canonicalName !== intent.canonicalNameAtRequest;
  if (!isLaterSnapshot || (!isNoOp && !canonicalNameChanged)) {
    return { next: intent, sendName: null };
  }

  const latestRequestedName = intent.latestRequestedName;
  if (!latestRequestedName || latestRequestedName === canonicalName) {
    return { next: null, sendName: null };
  }
  return {
    next: createPendingRenameIntent(
      latestRequestedName,
      canonicalName,
      false,
      snapshotRevision
    ),
    sendName: latestRequestedName
  };
}

type SubmissionWatchdogIdentity = Pick<PendingSubmission, 'kind' | 'turnToken'>;

export function scheduleSubmissionWatchdog(
  expected: SubmissionWatchdogIdentity,
  readCurrent: () => PendingSubmission | null,
  onExpire: () => void
): () => void {
  const timeout = globalThis.setTimeout(() => {
    const current = readCurrent();
    if (
      current?.state === 'sending' &&
      current.kind === expected.kind &&
      current.turnToken === expected.turnToken
    ) {
      onExpire();
    }
  }, SUBMISSION_WATCHDOG_MS);
  return () => globalThis.clearTimeout(timeout);
}

export interface SubmissionReconciliation {
  next: PendingSubmission | null;
  newlyAccepted: boolean;
}

const PHASE_BY_SUBMISSION: Record<SubmissionKind, GamePhase> = {
  drawing: 'drawing',
  guess: 'guessing',
  vote: 'voting'
};

function submittedIds(snapshot: RoomSnapshot, kind: SubmissionKind): string[] {
  switch (kind) {
    case 'drawing':
      return snapshot.drawingSubmittedIds;
    case 'guess':
      return snapshot.guessSubmittedIds;
    case 'vote':
      return snapshot.voteSubmittedIds;
  }
}

export function playerSubmissionAccepted(
  snapshot: RoomSnapshot,
  clientId: string,
  kind: SubmissionKind,
  pending: PendingSubmission | null
): boolean {
  if (submittedIds(snapshot, kind).includes(clientId)) {
    return true;
  }
  return (
    snapshot.phase === PHASE_BY_SUBMISSION[kind] &&
    pending?.kind === kind &&
    pending.turnToken === snapshot.turnToken &&
    pending.state === 'accepted'
  );
}

export function playerNeedsAction(snapshot: RoomSnapshot, clientId: string): boolean {
  const player = snapshot.players.find((candidate) => candidate.id === clientId);
  if (!player?.connected || player.spectator) {
    return false;
  }

  switch (snapshot.phase) {
    case 'drawing':
      return !snapshot.drawingSubmittedIds.includes(clientId);
    case 'guessing':
      return (
        snapshot.currentArtistId !== clientId &&
        !snapshot.guessSubmittedIds.includes(clientId)
      );
    case 'voting':
      return (
        snapshot.currentArtistId !== clientId &&
        !snapshot.voteSubmittedIds.includes(clientId)
      );
    case 'lobby':
    case 'results':
    case 'finalScores':
      return false;
  }
}

export interface PlayerActionAlert {
  key: string;
  playSound: boolean;
  haptic: true;
}

export function playerActionAlert(
  snapshot: RoomSnapshot,
  clientId: string,
  lastAlertKey: string,
  soundOn: boolean
): PlayerActionAlert | null {
  if (!playerNeedsAction(snapshot, clientId)) {
    return null;
  }
  const key = `${snapshot.roomCode}:${snapshot.phase}:${snapshot.turnToken}`;
  if (key === lastAlertKey) {
    return null;
  }
  return { key, playSound: soundOn, haptic: true };
}

export function reconcilePendingSubmission(
  current: PendingSubmission | null,
  snapshot: RoomSnapshot,
  clientId: string
): SubmissionReconciliation {
  if (!current) {
    return { next: null, newlyAccepted: false };
  }

  const acknowledged = submittedIds(snapshot, current.kind).includes(clientId);
  const stillCurrent =
    snapshot.phase === PHASE_BY_SUBMISSION[current.kind] &&
    snapshot.turnToken === current.turnToken;

  if (acknowledged) {
    return {
      next:
        stillCurrent && current.state !== 'accepted'
          ? { ...current, state: 'accepted' }
          : stillCurrent
            ? current
            : null,
      newlyAccepted: current.state !== 'accepted'
    };
  }

  if (!stillCurrent) {
    return { next: null, newlyAccepted: false };
  }

  return { next: current, newlyAccepted: false };
}

export function acknowledgeDuplicateSubmission(
  current: PendingSubmission | null,
  snapshot: RoomSnapshot | null
): SubmissionReconciliation {
  if (
    !current ||
    !snapshot ||
    snapshot.phase !== PHASE_BY_SUBMISSION[current.kind] ||
    snapshot.turnToken !== current.turnToken
  ) {
    return { next: current, newlyAccepted: false };
  }
  if (current.state === 'accepted') {
    return { next: current, newlyAccepted: false };
  }
  return { next: { ...current, state: 'accepted' }, newlyAccepted: true };
}

export function retryPendingSubmission(
  current: PendingSubmission | null
): PendingSubmission | null {
  if (!current || current.state === 'accepted') {
    return current;
  }
  return { ...current, state: 'retry' };
}
