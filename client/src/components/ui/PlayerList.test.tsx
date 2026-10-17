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

describe('PlayerList open seats', () => {
  const player = (id: string, name: string) => ({ id, name, score: 0, connected: true, spectator: false, isHost: false });

  it('fills the empty room with dashed seats and drops the icon', () => {
    const markup = renderToStaticMarkup(<PlayerList players={[]} openSeats={3} />);
    expect(markup.match(/class="open-seat"/g)).toHaveLength(3);
    expect(markup).toContain('player-list--seats');
    expect(markup).not.toContain('empty-icon');
  });

  it('keeps the icon when no seats are requested', () => {
    const markup = renderToStaticMarkup(<PlayerList players={[]} />);
    expect(markup).toContain('empty-icon');
    expect(markup).not.toContain('open-seat');
  });

  it('shows only the remaining seats after players join, and none once full', () => {
    const two = renderToStaticMarkup(<PlayerList players={[player('a', 'Ava'), player('b', 'Bo')]} openSeats={1} />);
    expect(two.match(/class="open-seat"/g)).toHaveLength(1);
    const full = renderToStaticMarkup(<PlayerList players={[player('a', 'Ava')]} openSeats={0} />);
    expect(full).not.toContain('open-seat');
  });
});
