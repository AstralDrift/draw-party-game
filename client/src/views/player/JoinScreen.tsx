import { useEffect, useRef, useState } from 'react';
import { LogIn } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function JoinScreen(): React.JSX.Element {
  const {
    initialRoomCode,
    pendingJoin,
    status,
    playerName,
    roomCodeDraft,
    setPlayerName,
    setRoomCodeDraft,
    setErrorMessage,
    joinRoom,
    cancelJoin,
    clearError
  } = useGame();
  const [manualRoomEntry, setManualRoomEntry] = useState(!initialRoomCode);
  const [validationError, setValidationError] = useState<{
    field: 'roomCode' | 'name';
    message: string;
  } | null>(null);
  const joinFormRef = useRef<HTMLFormElement>(null);
  const joinStartedRef = useRef(false);
  const confirmedRoomCode = manualRoomEntry ? '' : initialRoomCode;

  const formInput = (name: 'roomCode' | 'name') =>
    joinFormRef.current?.elements.namedItem(name) as HTMLInputElement | null;

  useEffect(() => {
    if (!pendingJoin) {
      joinStartedRef.current = false;
      if (window.location.pathname.replace(/\/+$/, '') === '/join') {
        setManualRoomEntry(true);
      }
    }
  }, [pendingJoin]);

  useEffect(() => {
    if (!pendingJoin && confirmedRoomCode) {
      formInput('name')?.focus();
    }
  }, [confirmedRoomCode, pendingJoin]);

  const focusName = () => {
    formInput('name')?.focus();
  };

  const changeRoom = () => {
    joinStartedRef.current = false;
    setValidationError(null);
    setManualRoomEntry(true);
    clearError();
    cancelJoin();
  };

  const joining = Boolean(pendingJoin);
  const joinRetrying =
    joining && (status === 'Disconnected' || status === 'Connection error');
  const displayCode = pendingJoin?.roomCode || confirmedRoomCode;

  const join = () => {
    const roomCode = (confirmedRoomCode || roomCodeDraft).trim().toUpperCase();
    const name = playerName.trim();
    if (roomCode.length !== 4) {
      const message = 'Enter the four-letter room code from the TV.';
      setValidationError({ field: 'roomCode', message });
      setErrorMessage(message);
      formInput('roomCode')?.focus();
      return;
    }
    if (!name) {
      const message = 'Enter your name so everyone knows who is playing.';
      setValidationError({ field: 'name', message });
      setErrorMessage(message);
      focusName();
      return;
    }
    if (joinStartedRef.current) {
      return;
    }
    joinStartedRef.current = true;
    setValidationError(null);
    clearError();
    joinRoom(roomCode, name);
  };

  return (
    <Shell title="Join Game">
      <GlassPanel className="narrow join-card player-join-card">
        <p className="eyebrow">{displayCode || 'Type the code'}</p>
        <form
          ref={joinFormRef}
          className="join-form"
          aria-busy={joining}
          onSubmit={(event) => {
            event.preventDefault();
            if (!displayCode && document.activeElement === formInput('roomCode')) {
              focusName();
              return;
            }
            join();
          }}
        >
          {displayCode ? null : (
            <Field label="Room code">
              <TextInput
                id="join-room-code"
                name="roomCode"
                className="code-input"
                value={roomCodeDraft}
                maxLength={4}
                placeholder="CODE"
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
                enterKeyHint="next"
                aria-invalid={validationError?.field === 'roomCode'}
                aria-describedby={
                  validationError?.field === 'roomCode' ? 'join-room-code-error' : undefined
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    focusName();
                  }
                }}
                onChange={(event) => {
                  setRoomCodeDraft(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 4)
                  );
                  setValidationError(null);
                  clearError();
                }}
              />
              {validationError?.field === 'roomCode' ? (
                <span id="join-room-code-error" className="visually-hidden">
                  {validationError.message}
                </span>
              ) : null}
            </Field>
          )}
          <Field label="Name">
            <TextInput
              id="join-player-name"
              name="name"
              value={playerName}
              maxLength={24}
              placeholder="Your name"
              autoComplete="name"
              autoFocus={Boolean(confirmedRoomCode) && !joining}
              enterKeyHint="go"
              disabled={joining}
              aria-invalid={validationError?.field === 'name'}
              aria-describedby={
                validationError?.field === 'name' ? 'join-player-name-error' : undefined
              }
              onChange={(event) => {
                setPlayerName(event.target.value);
                setValidationError(null);
                clearError();
              }}
            />
            {validationError?.field === 'name' ? (
              <span id="join-player-name-error" className="visually-hidden">
                {validationError.message}
              </span>
            ) : null}
          </Field>
          {joinRetrying ? (
            <p className="error" role="alert">
              Connection dropped — retrying.
            </p>
          ) : joining ? (
            <p className="visually-hidden" role="status">
              Joining…
            </p>
          ) : null}
          <Button wide icon={LogIn} type="submit" disabled={joining} aria-busy={joining}>
            {joining ? (joinRetrying ? 'Retrying…' : 'Joining…') : 'Join the Party'}
          </Button>
          {displayCode && !joining ? (
            <Button type="button" variant="ghost" className="join-change-room" onClick={changeRoom}>
              Change room
            </Button>
          ) : null}
        </form>
      </GlassPanel>
    </Shell>
  );
}
