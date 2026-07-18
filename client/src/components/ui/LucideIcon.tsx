import { createElement } from 'react';
import type { IconNode } from 'lucide';

interface LucideIconProps {
  icon: IconNode;
  className?: string;
}

export function LucideIcon({ icon, className = 'button-icon' }: LucideIconProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {icon.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: `${tag}-${index}` }))}
    </svg>
  );
}
