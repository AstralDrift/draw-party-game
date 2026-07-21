import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { deadlineExtensionResolution } from '../../controller';
import type { RoomSnapshot } from '../../protocol';
import { isSelfHost } from '../../host';
import { Button } from './Button';

export function HostTimeExtension(): React.JSX.Element | null {
  const { snapshot, clientId, status, errorMessage, clearError, send } = useGame();
  const [requestedTurn, setRequestedTurn] = useState<number | null>(null);
  const requestedSnapshotRef = useRef<RoomSnapshot | null>(null);

  useEffect(() => {
    const resolution = deadlineExtensionResolution(
      requestedTurn,
      snapshot,
      requestedSnapshotRef.current !== snapshot,
      status,
      errorMessage
    );
    if (resolution !== 'idle' && resolution !== 'pending') {
      setRequestedTurn(null);
      requestedSnapshotRef.current = null;
    }
  }, [errorMessage, requestedTurn, snapshot, status]);

  if (
    !snapshot ||
    !isSelfHost(snapshot.players, clientId) ||
    !['drawing', 'guessing', 'voting'].includes(snapshot.phase) ||
    !snapshot.deadlineExtensionAvailable
  ) {
    return null;
  }

  const requested = requestedTurn === snapshot.turnToken;
  return (
    <Button
      variant="ghost"
      className="tool-button"
      icon={Clock3}
      disabled={requested}
      onClick={() => {
        if (requested) {
          return;
        }
        clearError();
        if (!send({ type: 'extendDeadline', turnToken: snapshot.turnToken })) {
          return;
        }
        requestedSnapshotRef.current = snapshot;
        setRequestedTurn(snapshot.turnToken);
      }}
    >
      {requested ? 'Adding…' : '+30 seconds'}
    </Button>
  );
}
