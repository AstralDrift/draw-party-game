import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerList, playerAccentSlot } from './PlayerList';

describe('playerAccentSlot', () => {
  it('is stable for a player regardless of roster order', () => {
    const firstOrder = ['player-c', 'player-a', 'player-b'].map(playerAccentSlot);
    const secondOrder = ['player-b', 'player-c', 'player-a'].map(playerAccentSlot);

    expect(firstOrder[1]).toBe(secondOrder[2]);
    expect(firstOrder[0]).toBe(secondOrder[1]);
    expect(firstOrder[2]).toBe(secondOrder[0]);
  });

  it('always returns one of the eight documented accents', () => {
    for (const id of ['a', 'room/player/2', 'reconnected-player', '😀-player', 'long-player-id-123']) {
      expect(playerAccentSlot(id)).toBeGreaterThanOrEqual(0);
      expect(playerAccentSlot(id)).toBeLessThan(8);
    }
  });
});

describe('PlayerList', () => {
  it('keeps spectator status in the accessible name, not a Watching pill', () => {
    const markup = renderToStaticMarkup(
      <PlayerList
        players={[
          {
            id: 'host',
            name: 'Ada',
            score: 0,
            connected: true,
            spectator: false,
            isHost: true
          },
          {
            id: 'late',
            name: 'Late',
            score: 0,
            connected: true,
            spectator: true,
            isHost: false
          }
        ]}
      />
    );

    expect(markup).toContain('>Late<');
    expect(markup).toContain('aria-label="Late, spectating"');
    expect(markup).not.toContain('Watching');
    expect(markup).toContain('>Ada<');
  });

  it('still marks disconnected players Offline', () => {
    const markup = renderToStaticMarkup(
      <PlayerList
        players={[
          {
            id: 'host',
            name: 'Ada',
            score: 0,
            connected: false,
            spectator: false,
            isHost: true
          }
        ]}
      />
    );

    expect(markup).toContain('Offline');
    expect(markup).toContain('is-offline');
  });
});
