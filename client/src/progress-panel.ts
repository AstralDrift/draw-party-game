import { el } from './dom';
import type { RoomSnapshot } from './protocol';
import { playingPlayers } from './spectator';

export type SubmissionPhase = 'drawing' | 'guessing' | 'voting';

export function renderProgressPanel(
  snapshot: RoomSnapshot | null | undefined,
  label: string,
  submittedIds: string[],
  phase: SubmissionPhase
): HTMLElement {
  const players = playingPlayers(snapshot?.players ?? []);
  const connectedPlayers = players.filter((player) => player.connected);
  const eligiblePlayers = connectedPlayers.filter(
    (player) => phase === 'drawing' || player.id !== snapshot?.currentArtistId
  );
  const activeSubmittedIds = submittedIds.filter((playerId) =>
    eligiblePlayers.some((player) => player.id === playerId)
  );
  const progress =
    eligiblePlayers.length === 0
      ? 100
      : Math.round((activeSubmittedIds.length / eligiblePlayers.length) * 100);
  const waitingNames = eligiblePlayers
    .filter((player) => !submittedIds.includes(player.id))
    .map((player) => player.name);
  return el(
    'section',
    { class: 'panel progress-panel' },
    el('div', { class: 'panel-title' }, label),
    el(
      'div',
      { class: 'progress-hero' },
      el('div', { class: 'big-count' }, `${activeSubmittedIds.length}/${eligiblePlayers.length}`),
      el('div', { class: 'progress-ring', style: `--progress:${progress}%` }, el('span', {}, `${progress}%`))
    ),
    el(
      'p',
      { class: 'muted' },
      waitingNames.length === 0 ? 'Everyone is in.' : `Waiting on ${waitingNames.join(', ')}.`
    ),
    renderSubmissionList(players, submittedIds, phase, snapshot?.currentArtistId)
  );
}

function renderSubmissionList(
  players: RoomSnapshot['players'],
  submittedIds: string[],
  phase: SubmissionPhase,
  currentArtistId: string | null | undefined
): HTMLElement {
  const list = el('div', { class: 'player-list submission-list' });
  for (const [index, player] of players.entries()) {
    const artist = phase !== 'drawing' && player.id === currentArtistId;
    const submitted = submittedIds.includes(player.id);
    const state = !player.connected ? 'offline' : artist ? 'artist' : submitted ? 'submitted' : 'waiting';
    list.appendChild(
      el(
        'div',
        {
          class: `player-row submission-row ${player.connected ? 'online' : 'offline'} is-${state}`,
          style: `--row-index:${index}`
        },
        el('span', { class: 'player-name' }, player.name),
        el('span', { class: `pill status-pill status-${state}` }, submissionStatusLabel(state, phase))
      )
    );
  }
  if (!players.length) {
    list.appendChild(el('div', { class: 'empty-state' }, 'Waiting for players.'));
  }
  return list;
}

function submissionStatusLabel(
  state: 'offline' | 'artist' | 'submitted' | 'waiting',
  phase: SubmissionPhase
): string {
  if (state === 'offline') {
    return 'offline';
  }
  if (state === 'artist') {
    return 'artist';
  }
  if (state === 'waiting') {
    return 'waiting';
  }
  switch (phase) {
    case 'drawing':
      return 'drawing in';
    case 'guessing':
      return 'guess in';
    case 'voting':
      return 'voted';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
