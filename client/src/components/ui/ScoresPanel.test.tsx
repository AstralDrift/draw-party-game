import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '../../protocol';
import { ScoresPanel } from './ScoresPanel';

describe('ScoresPanel', () => {
  it('presents tied scores with the same competition rank and title', () => {
    const markup = renderToStaticMarkup(
      <ScoresPanel
        scores={scores([
          ['Ava', 400],
          ['Bo', 400],
          ['Cy', 200],
          ['Di', 200]
        ])}
        podium
        role="player"
      />
    );

    expect(markup.match(/class="podium-rank">1st</g)).toHaveLength(2);
    expect(markup.match(/class="podium-title">Champion</g)).toHaveLength(2);
    expect(markup.match(/class="podium-rank">3rd</g)).toHaveLength(2);
    expect(markup.match(/class="podium-title">Crowd Favorite</g)).toHaveLength(2);
    expect(markup).not.toContain('3. Di · Crowd Favorite');
    expect(markup).not.toContain('class="score-list"');
    expect(markup).toContain('class="podium is-crowded"');
    expect(markup).not.toContain('Runner-up');
  });

  it('keeps a maximum-size tie in the compact podium instead of a duplicate score list', () => {
    const markup = renderToStaticMarkup(
      <ScoresPanel
        scores={scores(
          Array.from(
            { length: 8 },
            (_, index): [string, number] => [`Player ${index + 1}`, 500]
          )
        )}
        podium
        role="display"
      />
    );

    expect(markup.match(/class="podium-place place-1"/g)).toHaveLength(8);
    expect(markup).toContain('class="podium is-crowded"');
    expect(markup).not.toContain('class="score-list"');
  });
});

function scores(entries: Array<[string, number]>): ScoreEntry[] {
  return entries.map(([name, score], index) => ({
    playerId: `p${index}`,
    name,
    score
  }));
}
