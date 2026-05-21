import type { RoomSnapshot, Role } from './protocol';

export interface ClientViewState {
  role: Role;
  clientId: string;
  initialRoomCode: string;
  pendingRoomCode?: string;
  snapshot: RoomSnapshot | null;
}

export function viewKeyFor(state: ClientViewState): string {
  const { role, clientId, initialRoomCode, pendingRoomCode, snapshot } = state;
  if (!snapshot) {
    return `${role}:join:${pendingRoomCode ?? initialRoomCode}`;
  }

  const base = `${role}:${snapshot.roomCode}:${snapshot.phase}:${snapshot.currentRound}:${snapshot.turnToken}:${snapshot.currentArtistId ?? ''}`;
  const settingsKey = [
    snapshot.settings.rounds,
    snapshot.settings.drawSeconds,
    snapshot.settings.guessSeconds,
    snapshot.settings.voteSeconds,
    snapshot.settings.promptPackId
  ].join(':');
  const playersKey = snapshot.players
    .map((player) => `${player.id}:${player.name}:${player.score}:${player.connected}`)
    .join('|');
  const scoreDeltaKey = snapshot.roundResult?.scoreDeltas.map((score) => `${score.playerId}:${score.delta}`).join('|') ?? '';
  const finalScoreKey = snapshot.finalScores.map((score) => `${score.playerId}:${score.score}`).join('|');

  if (role === 'display') {
    return [
      base,
      settingsKey,
      playersKey,
      snapshot.drawingSubmittedIds.join(','),
      snapshot.guessSubmittedIds.join(','),
      snapshot.voteSubmittedIds.join(','),
      snapshot.votingOptions.map((option) => `${option.id}:${option.text}`).join('|'),
      snapshot.roundResult?.correctAnswer ?? '',
      scoreDeltaKey,
      finalScoreKey
    ].join(';');
  }

  const ownDrawingSubmitted = snapshot.drawingSubmittedIds.includes(clientId);
  const ownGuessSubmitted = snapshot.guessSubmittedIds.includes(clientId);
  const ownVoteSubmitted = snapshot.voteSubmittedIds.includes(clientId);
  return [
    base,
    settingsKey,
    snapshot.phase === 'lobby' ? playersKey : '',
    ownDrawingSubmitted,
    ownGuessSubmitted,
    ownVoteSubmitted,
    snapshot.votingOptions.map((option) => `${option.id}:${option.text}:${option.authorPlayerId ?? ''}`).join('|'),
    snapshot.roundResult?.correctAnswer ?? '',
    scoreDeltaKey,
    finalScoreKey
  ].join(';');
}
