import type { ReactNode } from 'react';

interface GlassPanelProps {
  children?: ReactNode;
  className?: string;
  tone?: 'default' | 'soft' | 'strong';
}

export function GlassPanel({
  children,
  className = '',
  tone = 'default'
}: GlassPanelProps): React.JSX.Element {
  const toneClass =
    tone === 'soft' ? 'glass-panel--soft' : tone === 'strong' ? 'glass-panel--strong' : '';
  return <section className={['glass-panel', 'fade-rise', toneClass, className].filter(Boolean).join(' ')}>{children}</section>;
}
