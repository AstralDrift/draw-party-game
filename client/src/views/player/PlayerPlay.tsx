import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { playerSubmissionAccepted, voteOptionAccessibleName } from '../../controller';
import { optionLabel } from '../../option-label';
import { playerActionHint } from '../../polish';
import { TurnDraftCache } from '../../turn-draft-cache';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HostTimeExtension } from '../../components/ui/HostTimeExtension';
import { ReactionBar, ReactionBursts } from '../../components/ui/ReactionBar';
import { Shell } from '../../components/ui/Shell';

export function PlayerGuessing(): React.JSX.Element {
  const { snapshot, clientId, pendingSubmission, submitAction, setErrorMessage } = useGame();
  const draftCache = useMemo(() => new TurnDraftCache(), []);
  const [guess, setGuess] = useState(() => {
    const draft = snapshot ? draftCache.restore(snapshot, clientId) : null;
    return draft?.phase === 'guessing' ? draft.guess : '';
  });
  const isArtist = snapshot?.currentArtistId === clientId;
  const turnToken = snapshot?.turnToken ?? -1;
  const submission =
    pendingSubmission?.kind === 'guess' && pendingSubmission.turnToken === turnToken
      ? pendingSubmission
      : null;
  const submitted = snapshot
    ? playerSubmissionAccepted(snapshot, clientId, 'guess', pendingSubmission)
    : false;
  const sending = submission?.state === 'sending';
  const retrying = submission?.state === 'retry';

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    if (submitted) {
      draftCache.clear();
      return;
    }
    draftCache.restore(snapshot, clientId);
  }, [clientId, draftCache, snapshot, submitted]);

  if (!snapshot) {
    return (
      <Shell title="Guess">
        <GlassPanel />
      </Shell>
    );
  }

  const submitGuess = () => {
    const next = guess.trim();
    if (!next) {
      setErrorMessage('Enter a fake title first.');
      return;
    }
    if (submitAction('guess', { type: 'submitGuess', turnToken, guess: next })) {
      setErrorMessage('');
    }
  };

  return (
    <Shell title="Guess">
      <GlassPanel className="play-panel player-turn-panel guessing-turn">
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">{isArtist ? 'Your drawing' : 'Fool the room'}</p>
            <div className="prompt small">{isArtist ? 'Fake titles incoming' : 'Write a title that could be real'}</div>
          </div>
          <div className="turn-timing-controls">
            <Deadline />
            <HostTimeExtension />
          </div>
        </div>
        <p className="action-hint">{playerActionHint('guessing', isArtist)}</p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        {isArtist ? (
          <div className="success-box">You’re the artist. Sit back and enjoy the chaos.</div>
        ) : (
          <form
            className="player-action-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitGuess();
            }}
          >
            {retrying ? (
              <div className="error" role="alert">
                Not accepted yet. Your title is still here—edit it or try again.
              </div>
            ) : null}
            <Field label="Fake title">
              <TextInput
                maxLength={60}
                placeholder="Something that sounds legit…"
                disabled={submitted || sending}
                value={guess}
                enterKeyHint="send"
                onChange={(event) => {
                  const next = event.target.value;
                  setGuess(next);
                  draftCache.saveGuess(snapshot, clientId, next);
                }}
              />
            </Field>
            <Button wide type="submit" icon={Send} disabled={submitted || sending}>
              {sending ? 'Sending…' : retrying ? 'Try Again' : 'Submit Fake Title'}
            </Button>
            {submitted ? (
              <p
                className="success-box submission-state is-accepted"
                role="status"
                aria-live="polite"
              >
                Title sent! Waiting for the room…
              </p>
            ) : sending ? (
              <p className="submit-help submission-state is-pending" role="status" aria-busy="true">
                Sending… waiting for server confirmation.
              </p>
            ) : null}
          </form>
        )}
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}

export function PlayerVoting(): React.JSX.Element {
  const { snapshot, clientId, pendingSubmission, submitAction, setErrorMessage } = useGame();
  const draftCache = useMemo(() => new TurnDraftCache(), []);

  useEffect(() => {
    if (snapshot) {
      draftCache.restore(snapshot, clientId);
    }
  }, [clientId, draftCache, snapshot]);

  if (!snapshot) {
    return (
      <Shell title="Vote">
        <GlassPanel />
      </Shell>
    );
  }

  const isArtist = snapshot.currentArtistId === clientId;
  const turnToken = snapshot.turnToken;
  const submission =
    pendingSubmission?.kind === 'vote' && pendingSubmission.turnToken === turnToken
      ? pendingSubmission
      : null;
  const submitted = playerSubmissionAccepted(snapshot, clientId, 'vote', pendingSubmission);
  const sending = submission?.state === 'sending';
  const retrying = submission?.state === 'retry';
  const nailedIt = Boolean(snapshot.nailedIt);

  return (
    <Shell title="Vote">
      <GlassPanel className="play-panel player-turn-panel voting-turn">
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">{isArtist ? 'Your drawing' : 'Find the truth'}</p>
            <div className="prompt small">{isArtist ? 'Watch them sweat' : 'Which one is real?'}</div>
          </div>
          <div className="turn-timing-controls">
            <Deadline />
            <HostTimeExtension />
          </div>
        </div>
        <p className="action-hint">
          {nailedIt ? 'Your title matched the prompt, so the server locked the correct vote.' : playerActionHint('voting', isArtist)}
        </p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        {retrying ? (
          <div className="error" role="alert">
            Not accepted yet. Tap the selected choice again or choose another.
          </div>
        ) : null}
        {isArtist ? (
          <div className="success-box">You’re the artist. Watch who takes the bait.</div>
        ) : nailedIt ? (
          <div className="success-box" role="status" aria-live="polite">
            Nailed it — correct vote locked.
          </div>
        ) : (
          <div className="vote-list compact player-vote-list">
            {snapshot.votingOptions.map((option, index) => {
              const label = optionLabel(index);
              const ownGuess = option.authorPlayerId === clientId;
              const selected = submission?.optionId === option.id;
              const disabled = submitted || ownGuess || sending;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${disabled ? 'vote-option disabled' : 'vote-option'}${selected ? ' is-selected' : ''}`}
                  disabled={disabled}
                  aria-label={voteOptionAccessibleName(label, option.text, {
                    ownGuess,
                    selected,
                    sending,
                    retrying,
                    submitted
                  })}
                  aria-pressed={selected}
                  onClick={() => {
                    if (
                      submitAction(
                        'vote',
                        { type: 'submitVote', turnToken, optionId: option.id },
                        option.id
                      )
                    ) {
                      setErrorMessage('');
                    }
                  }}
                >
                  <span className="vote-option-content">
                    <span className="option-label" aria-hidden="true">
                      {label}
                    </span>
                    <span className="vote-answer">{option.text}</span>
                  </span>
                  {selected && sending ? <span className="vote-reason">Sending…</span> : null}
                  {selected && retrying ? (
                    <span className="vote-reason">Tap again to retry</span>
                  ) : null}
                  {selected && submitted ? <span className="vote-reason">Your vote</span> : null}
                  {ownGuess ? <span className="vote-reason">Your fake answer</span> : null}
                  {submitted && !ownGuess && !selected ? (
                    <span className="vote-reason">Vote submitted</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {!isArtist && !nailedIt && sending ? (
          <p className="submission-state is-pending" role="status" aria-busy="true">
            Sending your vote…
          </p>
        ) : null}
        {!isArtist && !nailedIt && submitted ? (
          <p className="submission-state is-accepted" role="status" aria-live="polite">
            Vote locked!
          </p>
        ) : null}
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}
