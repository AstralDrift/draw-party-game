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

  if (pendingJoin) {
    return (
      <Shell title="Join Game">
        <GlassPanel className="narrow waiting-panel join-card">
          <p className="eyebrow">{pendingJoin.roomCode}</p>
          <h2>Almost in</h2>
          <p className="muted">
            {status === 'Connected'
              ? 'Connected. Waiting for the TV to seat you…'
              : 'Connection dropped — retrying automatically.'}
          </p>
          <Button variant="secondary" wide onClick={cancelJoin}>
            Change Room
          </Button>
        </GlassPanel>
      </Shell>
    );
  }

  const join = () => {
    const roomCode = roomCodeDraft.trim().toUpperCase();
    const name = playerName.trim() || 'Player';
    if (roomCode.length !== 4) {
      setErrorMessage('Enter the four-letter room code from the TV.');
      return;
    }
    clearError();
    joinRoom(roomCode, name);
  };

  return (
    <Shell title="Join Game">
      <GlassPanel className="narrow join-card player-join-card">
        <p className="eyebrow">{initialRoomCode ? 'Room found' : 'Phone controller'}</p>
        <h2>Jump into the party</h2>
        <p className="muted join-note">
          {initialRoomCode
            ? 'Name yourself and tap Join. The TV is waiting.'
            : 'Type the 4-letter code on the TV, then your name.'}
        </p>
        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            join();
          }}
        >
          <Field label="Room code">
            <TextInput
              className="code-input"
              value={roomCodeDraft}
              maxLength={4}
              placeholder="CODE"
              autoComplete="off"
              onChange={(event) => {
                setRoomCodeDraft(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 4)
                );
                clearError();
              }}
            />
          </Field>
          <Field label="Name">
            <TextInput
              name="name"
              value={playerName}
              maxLength={24}
              placeholder="Your name"
              autoComplete="name"
              onChange={(event) => {
                setPlayerName(event.target.value);
                clearError();
              }}
            />
          </Field>
          <Button wide type="submit">
            Join the Party
          </Button>
        </form>
        <p className="muted join-note fine-print">
          Before start = full player. Mid-game = spectator until the next round.
        </p>
      </GlassPanel>
    </Shell>
  );
}
