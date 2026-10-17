import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerAccentSlot } from '../../player-identity';
import { PlayerAvatar } from './PlayerAvatar';

describe('PlayerAvatar', () => {
  it('is a decorative initial in the player’s stable accent slot', () => {
    const markup = renderToStaticMarkup(<PlayerAvatar playerId="player-b" name="  bo " size="xl" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(`data-player-slot="${playerAccentSlot('player-b')}"`);
    expect(markup).toContain('player-avatar--xl');
    expect(markup).toMatch(/>B<\/span>$/);
  });

  it('falls back to a question mark for a blank name', () => {
    expect(renderToStaticMarkup(<PlayerAvatar playerId="x" name="   " />)).toMatch(/>\?<\/span>$/);
  });
});
