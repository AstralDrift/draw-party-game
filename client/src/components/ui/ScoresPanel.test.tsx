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
    expect(markup.match(/class="podium-title">Third Place</g)).toHaveLength(2);
    expect(markup).not.toContain('3. Di · Third Place');
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

  it('presents practice as unscored instead of inventing a champion', () => {
    const markup = renderToStaticMarkup(
      <ScoresPanel scores={scores([['Ava', 0]])} podium role="player" practice />
    );

    expect(markup).toContain('Practice · scores off');
    expect(markup).toContain('Warm-up complete');
    expect(markup).not.toContain('Champion');
    expect(markup).not.toContain('podium-place');
    expect(markup).not.toContain('share-card-button');
  });

  it('keeps controller sharing direct while labeling the TV export as a fallback', () => {
    const scoreEntries = scores([
      ['Ava', 400],
      ['Bo', 200]
    ]);
    const playerMarkup = renderToStaticMarkup(
      <ScoresPanel scores={scoreEntries} podium role="player" />
    );
    const displayMarkup = renderToStaticMarkup(
      <ScoresPanel scores={scoreEntries} podium role="display" />
    );

    expect(playerMarkup).toContain('Download Podium');
    expect(playerMarkup).not.toContain('from TV (fallback)');
    expect(displayMarkup).toContain('Download Podium from TV (fallback)');
    expect(displayMarkup).toContain('tv-action-fallback');
    expect(displayMarkup).toContain('btn--ghost');
  });
});

function scores(entries: Array<[string, number]>): ScoreEntry[] {
  return entries.map(([name, score], index) => ({
    playerId: `p${index}`,
    name,
    score
  }));
}
