import { playerAccentSlot, playerInitial } from '../../player-identity';

export type PlayerAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface PlayerAvatarProps {
  playerId: string;
  name: string;
  size?: PlayerAvatarSize;
  className?: string;
}

/** Decorative initial disc in the player's stable accent; names stay as text elsewhere. */
export function PlayerAvatar({
  playerId,
  name,
  size = 'md',
  className = ''
}: PlayerAvatarProps): React.JSX.Element {
  return (
    <span
      className={['player-avatar', `player-avatar--${size}`, className].filter(Boolean).join(' ')}
      data-player-slot={playerAccentSlot(playerId)}
      aria-hidden="true"
    >
      {playerInitial(name)}
    </span>
  );
}
