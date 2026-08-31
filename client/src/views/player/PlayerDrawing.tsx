import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { playerSubmissionAccepted } from '../../controller';
import type { DrawingPad } from '../../drawing';
import { isSelfHost } from '../../host';
import { TurnDraftCache } from '../../turn-draft-cache';
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
  const toolsSlotRef = useRef<HTMLDivElement>(null);
  const draftCache = useMemo(() => new TurnDraftCache(), []);
  const [restoredDrawing] = useState(() => {
    const draft = snapshot ? draftCache.restore(snapshot, clientId) : null;
    return draft?.phase === 'drawing' ? draft.drawing : null;
  });
  const [ready, setReady] = useState(false);
  const turnToken = snapshot?.turnToken ?? -1;
  const submission =
    pendingSubmission?.kind === 'drawing' && pendingSubmission.turnToken === turnToken
      ? pendingSubmission
      : null;
  const submitted = snapshot
    ? playerSubmissionAccepted(snapshot, clientId, 'drawing', pendingSubmission)
    : false;
  const sending = submission?.state === 'sending';
  const retrying = submission?.state === 'retry';
  const onReadyChange = useCallback((next: boolean) => setReady(next), []);
  const onDrawingChange = useCallback(
    (drawing: ReturnType<DrawingPad['getDrawing']>) => {
      if (snapshot) {
        draftCache.saveDrawing(snapshot, clientId, drawing);
      }
    },
    [clientId, draftCache, snapshot]
  );

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
      <Shell title="Draw">
        <GlassPanel />
      </Shell>
    );
  }

  if (submitted) {
    const isHost = isSelfHost(snapshot.players, clientId ?? '');
    return (
      <Shell title="Draw">
        <GlassPanel className="play-panel player-turn-panel drawing-turn">
          {isHost ? (
            <div className="turn-header compact">
              <div className="turn-timing-controls">
                <HostTimeExtension />
              </div>
            </div>
          ) : null}
          <div
            className="success-box submission-state is-accepted"
            role="status"
            aria-live="polite"
          >
            Watch the TV.
          </div>
        </GlassPanel>
      </Shell>
    );
  }

  return (
    <Shell title="Draw">
      <GlassPanel className="play-panel player-turn-panel drawing-turn">
        <div className="turn-header">
          <div className="turn-copy">
            <div className="prompt" id="prompt-text">
              {prompt ? prompt : 'Waiting for prompt...'}
            </div>
          </div>
          <div className="turn-timing-controls">
            <div ref={toolsSlotRef} className="drawing-tools-slot" />
            <Deadline />
            <HostTimeExtension />
          </div>
        </div>
        {retrying ? (
          <div className="error drawing-submit-status" role="alert">
            {status === 'Connected'
              ? 'Not accepted yet—adjust if needed, then submit again.'
              : 'Connection lost—reconnecting…'}
          </div>
        ) : null}
        <DrawingPadHost
          padRef={padRef}
          toolsSlotRef={toolsSlotRef}
          initialDrawing={restoredDrawing}
          onDrawingChange={onDrawingChange}
          onReadyChange={onReadyChange}
          locked={sending}
        >
          {ready || sending || retrying ? (
            <div className={`submit-dock${ready ? ' is-ready' : ''}`}>
              <Button
                wide
                icon={Send}
                disabled={sending}
                aria-label={retrying ? 'Try Submit Again' : 'Submit Drawing'}
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
              {sending ? (
                <p
                  className="submit-help submission-state is-pending"
                  role="status"
                  aria-busy="true"
                >
                  Sending… waiting for server confirmation.
                </p>
              ) : null}
            </div>
          ) : null}
        </DrawingPadHost>
      </GlassPanel>
    </Shell>
  );
}
