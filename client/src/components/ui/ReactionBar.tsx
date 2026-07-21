import { REACTION_EMOJIS, type ReactionEmoji } from '../../protocol';
import { useGame } from '../../app/GameProvider';

interface ReactionBarProps {
  onReact?: (emoji: ReactionEmoji) => void;
}

interface ReactionSlotInput {
  id: number;
  playerId: string;
}

export const MAX_VISIBLE_REACTIONS = 5;

function preferredReactionSlot(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % MAX_VISIBLE_REACTIONS;
}

/** Assign visible reactions stable, collision-free lanes without relying on DOM child order. */
export function allocateReactionSlots<T extends ReactionSlotInput>(bursts: T[]): Array<T & { slot: number }> {
  const visible = bursts.slice(-MAX_VISIBLE_REACTIONS);
  const occupied = new Set<number>();
  return visible.map((burst) => {
    const preferred = preferredReactionSlot(burst.playerId);
    let slot = preferred;
    for (let offset = 0; offset < MAX_VISIBLE_REACTIONS; offset += 1) {
      const candidate = (preferred + offset) % MAX_VISIBLE_REACTIONS;
      if (!occupied.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    occupied.add(slot);
    return { ...burst, slot };
  });
}

export function ReactionBar({ onReact }: ReactionBarProps): React.JSX.Element {
  const { send, haptic } = useGame();
  return (
    <div className="reaction-bar" role="group" aria-label="Reactions">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-button"
          onClick={() => {
            onReact?.(emoji);
            send({ type: 'sendReaction', emoji });
            haptic(8);
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionBursts(): React.JSX.Element {
  const { reactionBursts } = useGame();
  const visibleBursts = allocateReactionSlots(reactionBursts);
  return (
    <div className="reaction-layer" aria-hidden="true">
      {visibleBursts.map((burst) => (
        <div key={burst.id} className="reaction-burst" data-slot={burst.slot}>
          <span className="reaction-emoji">{burst.emoji}</span>
          <span className="reaction-name">{burst.name}</span>
        </div>
      ))}
    </div>
  );
}
