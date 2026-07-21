import { useCallback, useRef, useState } from 'react';
import { Send } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { playerSubmissionAccepted } from '../../controller';
import type { DrawingPad } from '../../drawing';
import { playerActionHint } from '../../polish';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingPadHost } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HostTimeExtension } from '../../components/ui/HostTimeExtension';
import { Shell } from '../../components/ui/Shell';

export function PlayerDrawing(): React.JSX.Element {
  const { snapshot, clientId, prompt, status, pendingSubmission, submitAction, setErrorMessage } =
    useGame();
  const padRef = useRef<DrawingPad | null>(null);
  const [ready, setReady] = useState(false);
  const onReadyChange = useCallback((next: boolean) => setReady(next), []);

  if (!snapshot) {
    return (
      <Shell title="Draw">
        <GlassPanel />
      </Shell>
    );
  }

  const turnToken = snapshot.turnToken;
  const submission =
    pendingSubmission?.kind === 'drawing' && pendingSubmission.turnToken === turnToken
      ? pendingSubmission
      : null;
  const submitted = playerSubmissionAccepted(snapshot, clientId, 'drawing', pendingSubmission);
  const sending = submission?.state === 'sending';
  const retrying = submission?.state === 'retry';
  const practice = snapshot.gameMode === 'practice';

  const heading = (
    <div className="turn-header">
      <div className="turn-copy">
        <p className="eyebrow">
          {practice ? 'Practice drawing · no scores' : `Round ${snapshot.currentRound} of ${snapshot.totalRounds}`}
        </p>
        <div className="prompt" id="prompt-text">
          {prompt ? `Draw: ${prompt}` : 'Waiting for prompt...'}
        </div>
      </div>
      <div className="turn-timing-controls">
        <Deadline />
        <HostTimeExtension />
      </div>
    </div>
  );

  if (submitted) {
    return (
      <Shell title="Draw">
        <GlassPanel className="play-panel player-turn-panel drawing-turn">
          {heading}
          <p className="action-hint">{playerActionHint('drawing', false)}</p>
          <div
            className="success-box submission-state is-accepted"
            role="status"
            aria-live="polite"
          >
            Drawing locked in! Watch the TV.
          </div>
        </GlassPanel>
      </Shell>
    );
  }

  return (
    <Shell title="Draw">
      <GlassPanel className="play-panel player-turn-panel drawing-turn">
        {heading}
        <p className="action-hint">{playerActionHint('drawing', false)}</p>
        {retrying ? (
          <div className="error drawing-submit-status" role="alert">
            {status === 'Connected'
              ? 'Not accepted yet—adjust if needed, then submit again.'
              : 'Connection lost—reconnecting…'}
          </div>
        ) : null}
        <DrawingPadHost padRef={padRef} onReadyChange={onReadyChange} locked={sending}>
          <div className={`submit-dock${ready ? ' is-ready' : ''}`}>
            <Button
              wide
              icon={Send}
              disabled={!ready || sending}
              onClick={() => {
                const pad = padRef.current;
                if (!pad?.hasInk()) {
                  setErrorMessage('Draw at least one stroke before submitting.');
                  return;
                }
                const drawing = pad.getDrawing();
                pad.setLocked(true);
                if (
                  submitAction('drawing', {
                    type: 'submitDrawing',
                    turnToken,
                    drawing
                  })
                ) {
                  setErrorMessage('');
                } else {
                  pad.setLocked(false);
                }
              }}
            >
              {sending ? 'Sending…' : retrying ? 'Try Submit Again' : 'Submit Drawing'}
            </Button>
            <p
              className={`submit-help${sending ? ' submission-state is-pending' : ''}`}
              role={sending ? 'status' : undefined}
              aria-busy={sending || undefined}
            >
              {sending
                ? 'Sending… waiting for server confirmation.'
                : retrying
                  ? status === 'Connected'
                    ? 'Your drawing is still here. Adjust if needed, then try again.'
                    : 'Your drawing is still here. Reconnect, then try again.'
                  : ready
                    ? 'Ready when you are.'
                    : 'Draw one stroke to unlock submit.'}
            </p>
          </div>
        </DrawingPadHost>
      </GlassPanel>
    </Shell>
  );
}
