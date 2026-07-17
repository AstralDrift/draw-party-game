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

  const waitingToJoin = role === 'player' && !pendingJoin && !snapshot;
  const connection = waitingToJoin ? 'Ready to join' : status;

  return (
    <div className={`app-shell ${role} ${phaseClass}`}>
      <Atmosphere />
      <header className="topbar">
        <div>
          <div className="brand">{title}</div>
          {snapshot ? <div className="phase">{phaseLabel(snapshot.phase)}</div> : null}
        </div>
        <div className="connection connection-text" id="connection-text">
          {connection}
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
