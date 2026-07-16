import { REACTION_EMOJIS, type ReactionEmoji } from '../../protocol';
import { useGame } from '../../app/GameProvider';

interface ReactionBarProps {
  onReact?: (emoji: ReactionEmoji) => void;
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
  return (
    <>
      {reactionBursts.map((burst) => (
        <div key={burst.id} className="reaction-burst" aria-hidden="true">
          {burst.emoji} {burst.name}
        </div>
      ))}
    </>
  );
}
