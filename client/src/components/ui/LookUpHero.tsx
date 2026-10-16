import { ArrowUp } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { LucideIcon } from './LucideIcon';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * Decorative identity for "Look up" / "Watch the TV." phones: your avatar and a
 * nudge toward the TV. The words themselves stay in the existing text elements.
 */
export function LookUpHero(): React.JSX.Element | null {
  const { snapshot, clientId } = useGame();
  const self = snapshot?.players.find((player) => player.id === clientId);
  return (
    <div className="look-up-hero" aria-hidden="true">
      <span className="look-up-arrow">
        <LucideIcon icon={ArrowUp} />
      </span>
      {self ? <PlayerAvatar playerId={self.id} name={self.name} size="xl" /> : null}
    </div>
  );
}
