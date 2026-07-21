import { useEffect, useRef, type ReactNode } from 'react';
import { PencilLine } from 'lucide';
import { Atmosphere } from './Atmosphere';
import { LucideIcon } from './LucideIcon';
import { useGame } from '../../app/GameProvider';
import { phaseLabel } from '../../protocol';

interface ShellProps {
  title: string;
  children: ReactNode;
}

export function Shell({ title, children }: ShellProps): React.JSX.Element {
  const shellRef = useRef<HTMLDivElement>(null);
  const { role, snapshot, status, pendingJoin, errorMessage } = useGame();
  const phaseClass = !snapshot
    ? role === 'player' && !pendingJoin
      ? 'phase-join'
      : 'phase-connecting'
    : snapshot.phase === 'finalScores'
      ? 'phase-final-scores'
      : `phase-${snapshot.phase}`;

  const waitingToJoin = role === 'player' && !pendingJoin && !snapshot;
  const connection = waitingToJoin ? 'Ready to join' : status;
  const showConnectionBanner = status !== 'Connected' && Boolean(snapshot) && !errorMessage;
  const statusStrip = errorMessage ? (
    <div className="error" role="alert">
      {errorMessage}
    </div>
  ) : showConnectionBanner ? (
    <div className="connection-banner">{status}</div>
  ) : null;

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        shellRef.current?.style.setProperty('--pointer-x', `${event.clientX}px`);
        shellRef.current?.style.setProperty('--pointer-y', `${event.clientY}px`);
        frame = 0;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const connectionClass = connection === 'Connected' ? 'is-online' : connection === 'Ready to join' ? 'is-idle' : 'is-reconnecting';

  return (
    <div ref={shellRef} className={`app-shell ${role} ${phaseClass}`}>
      <Atmosphere />
      <div className="shell-chrome">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark">
              <LucideIcon icon={PencilLine} className="brand-icon" />
            </span>
            <div>
              <div className="brand">{title}</div>
              {snapshot ? <div className="phase">{phaseLabel(snapshot.phase)}</div> : null}
            </div>
          </div>
          <div className={`connection connection-text ${connectionClass}`}>
            <span className="connection-orb" />
            <span id="connection-text">{connection}</span>
          </div>
        </header>
        {statusStrip}
      </div>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {snapshot ? `${phaseLabel(snapshot.phase)}. ${status}.` : connection}
      </div>
      {children}
    </div>
  );
}
