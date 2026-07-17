import { el } from './dom';
import { renderDrawing } from './drawing';
import type { RoomSnapshot } from './protocol';
import { spectatorBanner } from './spectator';

export type SpectatorViewDeps = {
  lobby: () => HTMLElement;
  drawingProgress: () => HTMLElement;
  reactionBar: () => HTMLElement;
  reconnectHint: (message: string) => HTMLElement;
  votingOptions: () => HTMLElement;
  results: () => HTMLElement;
  scores: () => HTMLElement;
};

/** Watch-only player content for each phase. Play turn UIs stay in main.ts. */
export function renderSpectatorView(snapshot: RoomSnapshot, deps: SpectatorViewDeps): HTMLElement {
  switch (snapshot.phase) {
    case 'lobby':
      return deps.lobby();
    case 'drawing':
      return renderSpectatorDrawingWatch(snapshot, deps.drawingProgress());
    case 'guessing':
      return renderSpectatorGuessingWatch(
        snapshot,
        deps.reactionBar(),
        deps.reconnectHint('Watch the guesses roll in.')
      );
    case 'voting':
      return renderSpectatorVotingWatch(
        snapshot,
        deps.votingOptions(),
        deps.reactionBar(),
        deps.reconnectHint('Watch the vote on the TV.')
      );
    case 'results':
      return deps.results();
    case 'finalScores':
      return deps.scores();
    default: {
      const _exhaustive: never = snapshot.phase;
      return _exhaustive;
    }
  }
}

function renderSpectatorDrawingWatch(snapshot: RoomSnapshot, progressPanel: HTMLElement): HTMLElement {
  return el(
    'section',
    { class: 'panel play-panel player-turn-panel drawing-turn spectator-turn' },
    spectatorBanner(),
    el(
      'div',
      { class: 'turn-header' },
      el(
        'div',
        { class: 'turn-copy' },
        el('p', { class: 'eyebrow' }, `Round ${snapshot.currentRound} of ${snapshot.totalRounds}`),
        el('div', { class: 'prompt small' }, 'Players are drawing')
      ),
      el('div', { class: 'deadline', id: 'deadline-text' })
    ),
    el('p', { class: 'action-hint' }, 'Sit tight and watch the TV.'),
    progressPanel
  );
}

function renderSpectatorGuessingWatch(
  snapshot: RoomSnapshot,
  reactionBar: HTMLElement,
  reconnectHint: HTMLElement
): HTMLElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas phone-canvas';
  renderDrawing(canvas, snapshot.currentDrawing);
  return el(
    'section',
    { class: 'panel play-panel player-turn-panel guessing-turn spectator-turn' },
    spectatorBanner(),
    spectatorRevealHeader(snapshot, 'Players are guessing'),
    el('p', { class: 'action-hint' }, 'Watch the guesses roll in.'),
    canvas,
    reactionBar,
    reconnectHint
  );
}

function renderSpectatorVotingWatch(
  snapshot: RoomSnapshot,
  optionsPanel: HTMLElement,
  reactionBar: HTMLElement,
  reconnectHint: HTMLElement
): HTMLElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'reveal-canvas phone-canvas';
  renderDrawing(canvas, snapshot.currentDrawing);
  return el(
    'section',
    { class: 'panel play-panel player-turn-panel voting-turn spectator-turn' },
    spectatorBanner(),
    spectatorRevealHeader(snapshot, 'Players are voting'),
    el('p', { class: 'action-hint' }, 'Watch the vote on the TV.'),
    canvas,
    optionsPanel,
    reactionBar,
    reconnectHint
  );
}

function spectatorRevealHeader(snapshot: RoomSnapshot, promptText: string): HTMLElement {
  return el(
    'div',
    { class: 'turn-header compact' },
    el(
      'div',
      { class: 'turn-copy' },
      el(
        'p',
        { class: 'eyebrow' },
        snapshot.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Reveal'
      ),
      el('div', { class: 'prompt small' }, promptText)
    ),
    el('div', { class: 'deadline', id: 'deadline-text' })
  );
}
