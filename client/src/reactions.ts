import { button, el } from './dom';
import { REACTION_EMOJIS, type ReactionEmoji } from './protocol';

export function renderReactionBar(onReact: (emoji: ReactionEmoji) => void): HTMLElement {
  return el(
    'div',
    { class: 'reaction-bar', 'aria-label': 'Send a reaction' },
    ...REACTION_EMOJIS.map((emoji) =>
      button(emoji, 'reaction-button', () => {
        onReact(emoji);
      })
    )
  );
}

export function showReactionBurst(host: ParentNode, name: string, emoji: string): void {
  const burst = el('div', { class: 'reaction-burst', 'aria-hidden': 'true' }, `${emoji} ${name}`);
  host.appendChild(burst);
  window.setTimeout(() => burst.remove(), 1600);
}
