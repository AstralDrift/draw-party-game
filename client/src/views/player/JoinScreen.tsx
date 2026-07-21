import { useEffect, useRef, useState } from 'react';
import { LogIn, RotateCcw } from 'lucide';
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

  if (pendingJoin) {
    return (
      <Shell title="Join Game">
        <GlassPanel className="narrow waiting-panel join-card">
          <p className="eyebrow">{pendingJoin.roomCode}</p>
          <h2>Almost in</h2>
          <p className="muted">
            {status === 'Connected'
              ? 'Connected. Waiting for the TV to seat you…'
              : status === 'Disconnected' || status === 'Connection error'
                ? 'Connection dropped — retrying automatically.'
                : 'Connecting to the room…'}
          </p>
          <Button variant="secondary" wide icon={RotateCcw} onClick={changeRoom}>
            Change room
          </Button>
        </GlassPanel>
      </Shell>
    );
  }

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
        <p className="eyebrow">{confirmedRoomCode ? 'Room found' : 'Phone controller'}</p>
        <h2>Jump into the party</h2>
        <p className="muted join-note">
          {confirmedRoomCode
            ? 'Name yourself and tap Join. The TV is waiting.'
            : 'Type the 4-letter code on the TV, then your name.'}
        </p>
        <form
          ref={joinFormRef}
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmedRoomCode && document.activeElement === formInput('roomCode')) {
              focusName();
              return;
            }
            join();
          }}
        >
          {confirmedRoomCode ? (
            <div className="player-room-chip">
              <span>Room</span>
              <strong className="mini-room-code">{confirmedRoomCode}</strong>
            </div>
          ) : (
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
              autoFocus={Boolean(confirmedRoomCode)}
              enterKeyHint="go"
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
          <Button wide icon={LogIn} type="submit">
            Join the Party
          </Button>
          {confirmedRoomCode ? (
            <Button type="button" variant="secondary" wide icon={RotateCcw} onClick={changeRoom}>
              Change room
            </Button>
          ) : null}
        </form>
        <p className="muted join-note fine-print">
          Before start = full player. Mid-game = spectator until the next round.
        </p>
      </GlassPanel>
    </Shell>
  );
}
