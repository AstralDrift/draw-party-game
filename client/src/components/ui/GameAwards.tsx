import { Sparkles, Search, PencilLine } from 'lucide';
import type { AwardKind, GameAward } from '../../protocol';
import { LucideIcon } from './LucideIcon';

const AWARD_COPY = {
  masterBluffer: { title: 'Master Bluffer', icon: Sparkles, unit: 'bluff points' },
  truthDetective: { title: 'Truth Detective', icon: Search, unit: 'truths found' },
  picturePerfect: { title: 'Picture Perfect', icon: PencilLine, unit: 'correct votes inspired' }
} satisfies Record<AwardKind, { title: string; icon: typeof Sparkles; unit: string }>;

export function GameAwards({ awards, selfId }: { awards: GameAward[]; selfId?: string }) {
  const visible = selfId ? awards.filter((award) => award.winners.some((winner) => winner.playerId === selfId)) : awards;
  if (!visible.length) return null;
  return (
    <div className="game-awards" aria-label={selfId ? 'Your earned awards' : 'Earned awards'}>
      {visible.map((award) => {
        const copy = AWARD_COPY[award.kind];
        return (
          <div className="game-award" key={award.kind}>
            <LucideIcon icon={copy.icon} className="award-icon" />
            <div>
              <h3>{copy.title}</h3>
              <p className="award-winners">{selfId ? 'You earned it' : award.winners.map((winner) => winner.name).join(' · ')}</p>
              <span>{award.value} {copy.unit}{award.winners.length > 1 ? ' · shared' : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
