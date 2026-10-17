import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';
import { ProgressPanel } from './ProgressPanel';

function drawingSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    gameMode: 'party',
    players: [
      {
        id: 'a',
        name: 'Ava',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      },
      {
        id: 'b',
        name: 'Bo',
        score: 0,
        connected: true,
        spectator: false,
        isHost: false
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    settings: defaultRoomSettings(),
    serverNowMs: 100,
    currentRound: 1,
    totalRounds: 2,
    turnToken: 1,
    deadlineMs: 20_100,
    currentArtistId: null,
    currentArtistName: null,
    currentDrawing: null,
    votingOptions: [],
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: ['a'],
    guessSubmittedIds: [],
    voteSubmittedIds: []
  };
}

describe('ProgressPanel', () => {
  it('paints waiting names without a Waiting on coach line', () => {
    const markup = renderToStaticMarkup(
      <ProgressPanel
        title="Drawings"
        snapshot={drawingSnapshot()}
        submittedIds={['a']}
        phase="drawing"
        compact
      />
    );

    expect(markup).toContain('1/2');
    expect(markup).toContain('>Bo</p>');
    expect(markup).toContain('aria-label="Waiting on Bo"');
    expect(markup).not.toContain('Waiting on Bo<');
    expect(markup).not.toContain('>Waiting on');
  });

  it('roster mode seats every eligible player and marks who has locked', () => {
    const snapshot = drawingSnapshot();
    snapshot.players.push({ id: 's', name: 'Sam', score: 0, connected: true, spectator: true, isHost: false });
    const markup = renderToStaticMarkup(
      <ProgressPanel title="Drawings" snapshot={snapshot} submittedIds={['a']} phase="drawing" compact roster />
    );
    expect(markup.match(/class="progress-seat is-done"/g)).toHaveLength(1);
    expect(markup.match(/class="progress-seat"/g)).toHaveLength(1);
    expect(markup).not.toContain('Sam');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('header mode shows a dimmed avatar strip instead of seats', () => {
    const markup = renderToStaticMarkup(
      <ProgressPanel title="Votes" snapshot={drawingSnapshot()} submittedIds={['b']} phase="voting" compact />
    );
    expect(markup).not.toContain('progress-seat');
    expect(markup.match(/class="progress-avatar is-done"/g)).toHaveLength(1);
    expect(markup.match(/class="progress-avatar"/g)).toHaveLength(1);
  });
});
