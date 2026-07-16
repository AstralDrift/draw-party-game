import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { playerActionHint } from '../../polish';
import { playCue } from '../../sound';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBar, ReactionBursts } from '../../components/ui/ReactionBar';
import { Shell } from '../../components/ui/Shell';

export function PlayerGuessing(): React.JSX.Element {
  const { snapshot, clientId, send, setErrorMessage, haptic } = useGame();
  const [guess, setGuess] = useState('');

  if (!snapshot) {
    return (
      <Shell title="Guess">
        <GlassPanel />
      </Shell>
    );
  }

  const isArtist = snapshot.currentArtistId === clientId;
  const submitted = snapshot.guessSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;

  return (
    <Shell title="Guess">
      <GlassPanel className="play-panel player-turn-panel guessing-turn">
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">{isArtist ? 'Your drawing' : 'Write a fake'}</p>
            <div className="prompt small">{isArtist ? 'Players are guessing' : 'Make it believable'}</div>
          </div>
          <Deadline />
        </div>
        <p className="action-hint">{playerActionHint('guessing', isArtist)}</p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        {isArtist ? (
          <div className="success-box">This is your drawing. Wait for guesses.</div>
        ) : (
          <>
            <Field label="Fake answer">
              <TextInput
                maxLength={60}
                placeholder="Fake answer"
                disabled={submitted}
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
              />
            </Field>
            <Button
              wide
              disabled={submitted}
              onClick={() => {
                const next = guess.trim();
                if (!next) {
                  setErrorMessage('Enter a guess first.');
                  return;
                }
                send({ type: 'submitGuess', turnToken, guess: next });
                playCue('submit');
                haptic(10);
              }}
            >
              Submit Guess
            </Button>
            {submitted ? <p className="success-box">Guess submitted.</p> : null}
          </>
        )}
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}

export function PlayerVoting(): React.JSX.Element {
  const { snapshot, clientId, selectedVote, setSelectedVote, send, haptic } = useGame();

  if (!snapshot) {
    return (
      <Shell title="Vote">
        <GlassPanel />
      </Shell>
    );
  }

  const isArtist = snapshot.currentArtistId === clientId;
  const submitted = snapshot.voteSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;

  return (
    <Shell title="Vote">
      <GlassPanel className="play-panel player-turn-panel voting-turn">
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">{isArtist ? 'Your drawing' : 'Pick an answer'}</p>
            <div className="prompt small">{isArtist ? 'Watch the vote' : 'Find the real prompt'}</div>
          </div>
          <Deadline />
        </div>
        <p className="action-hint">{playerActionHint('voting', isArtist)}</p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        {isArtist ? (
          <div className="success-box">This is your drawing. Watch the vote.</div>
        ) : (
          <div className="vote-grid">
            {snapshot.votingOptions.map((option) => {
              const selected = selectedVote?.optionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`vote-option${selected ? ' is-selected' : ''}`}
                  disabled={submitted}
                  onClick={() => {
                    setSelectedVote({ turnToken, optionId: option.id });
                    send({ type: 'submitVote', turnToken, optionId: option.id });
                    playCue('submit');
                    haptic(10);
                  }}
                >
                  {option.text}
                </button>
              );
            })}
          </div>
        )}
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}
