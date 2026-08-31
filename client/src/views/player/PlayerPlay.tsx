import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { playerSubmissionAccepted, voteOptionAccessibleName } from '../../controller';
import { isSelfHost } from '../../host';
import { optionLabel } from '../../option-label';
import { TurnDraftCache } from '../../turn-draft-cache';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HostTimeExtension } from '../../components/ui/HostTimeExtension';
import { ReactionBar, ReactionBursts } from '../../components/ui/ReactionBar';
import { Shell } from '../../components/ui/Shell';

function PlayerTurnChrome({
  lookUp,
  showClock,
  showHostExtend = false
}: {
  lookUp: boolean;
  showClock: boolean;
  showHostExtend?: boolean;
}): React.JSX.Element | null {
  const { snapshot, clientId } = useGame();
  const isHost = isSelfHost(snapshot?.players ?? [], clientId ?? '');
  const extend = isHost && showHostExtend;
  if (!lookUp && !showClock && !extend) {
    return null;
  }

  return (
    <div className="turn-header compact">
      {lookUp ? (
        <div className="turn-copy">
          <div className="prompt small">Look up</div>
        </div>
      ) : null}
      {showClock || extend ? (
        <div className="turn-timing-controls">
          {showClock ? <Deadline /> : null}
          <HostTimeExtension />
        </div>
      ) : null}
    </div>
  );
}

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

  const titleReady = guess.trim().length > 0;

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
        <PlayerTurnChrome lookUp={isArtist} showClock={false} showHostExtend={isArtist || submitted} />
        {isArtist ? null : submitted ? (
          <p
            className="success-box submission-state is-accepted"
            role="status"
            aria-live="polite"
          >
            Watch the TV.
          </p>
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
            <Field label="Fake title" hideLabel>
              <TextInput
                maxLength={60}
                placeholder="Something that sounds legit…"
                disabled={sending}
                autoFocus
                value={guess}
                enterKeyHint="send"
                onChange={(event) => {
                  const next = event.target.value;
                  setGuess(next);
                  draftCache.saveGuess(snapshot, clientId, next);
                }}
              />
            </Field>
            {titleReady || sending || retrying ? (
              <Button
                wide
                type="submit"
                icon={Send}
                disabled={sending}
                aria-label={retrying ? 'Try Again' : 'Submit Fake Title'}
              >
                {sending ? 'Sending…' : retrying ? 'Try Again' : 'Submit Fake Title'}
              </Button>
            ) : null}
            {sending ? (
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
        <PlayerTurnChrome
          lookUp={isArtist || nailedIt}
          showClock={false}
          showHostExtend={isArtist || nailedIt || submitted}
        />
        {retrying ? (
          <div className="error" role="alert">
            Not accepted yet. Tap the selected choice again or choose another.
          </div>
        ) : null}
        {isArtist || nailedIt || submitted ? null : (
          <div className="vote-list compact player-vote-list">
            {snapshot.votingOptions.map((option, index) => {
              const label = optionLabel(index);
              const ownGuess = option.authorPlayerId === clientId;
              const selected = submission?.optionId === option.id;
              const disabled = ownGuess || sending;
              const caption = ownGuess
                ? 'Yours'
                : selected && sending
                  ? 'Sending…'
                  : selected && retrying
                    ? 'Tap again to retry'
                    : '';
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${disabled ? 'vote-option disabled' : 'vote-option'}${selected ? ' is-selected' : ''}${ownGuess ? ' is-own' : ''}`}
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
                    <span className="vote-answer visually-hidden" aria-hidden="true">
                      {option.text}
                    </span>
                  </span>
                  <span className="vote-reason">{caption}</span>
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
            Watch the TV.
          </p>
        ) : null}
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}
