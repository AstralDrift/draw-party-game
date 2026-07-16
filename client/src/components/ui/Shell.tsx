import type { ReactNode } from 'react';
import { Atmosphere } from './Atmosphere';
import { useGame } from '../../app/GameProvider';
import { phaseLabel } from '../../protocol';

interface ShellProps {
  title: string;
  children: ReactNode;
}

export function Shell({ title, children }: ShellProps): React.JSX.Element {
  const { role, snapshot, status, pendingJoin, errorMessage } = useGame();
  const phaseClass = !snapshot
    ? role === 'player' && !pendingJoin
      ? 'phase-join'
      : 'phase-connecting'
    : snapshot.phase === 'finalScores'
      ? 'phase-final-scores'
      : `phase-${snapshot.phase}`;

  const connection =
    role === 'player' && !pendingJoin && !snapshot ? 'Ready to join' : status;

  return (
    <div className={`app-shell ${role} ${phaseClass}`}>
      <Atmosphere />
      <header className="topbar">
        <div className="brand-mark">
          Draw Party {title !== 'Draw Party' ? <span>· {title}</span> : null}
        </div>
        <div className="connection-text" id="connection-text">
          {snapshot ? phaseLabel(snapshot.phase) : connection}
        </div>
      </header>
      {status !== 'Connected' && snapshot ? (
        <div className="connection-banner">{status}</div>
      ) : null}
      {errorMessage ? (
        <div className="error" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {children}
    </div>
  );
}
