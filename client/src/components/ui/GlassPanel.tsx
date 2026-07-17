import type { HTMLAttributes, ReactNode } from 'react';

interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
  tone?: 'default' | 'soft' | 'strong';
}

export function GlassPanel({
  children,
  className = '',
  tone = 'default',
  ...rest
}: GlassPanelProps): React.JSX.Element {
  const toneClass =
    tone === 'soft' ? 'glass-panel--soft' : tone === 'strong' ? 'glass-panel--strong' : '';
  return (
    <section
      className={['glass-panel', 'panel', 'fade-rise', toneClass, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </section>
  );
}
