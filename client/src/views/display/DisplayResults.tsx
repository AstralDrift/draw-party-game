import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Play, RotateCcw } from 'lucide';
import { useGame } from '../../app/GameProvider';
import {
  finalReplayPlan,
  shouldClearPendingAdvanceAfterReconnect,
  shouldResetPendingServerAction,
  type ReplayAction
} from '../../controller';
import { useRevealStage } from '../../hooks/useRevealStage';
import { useServerTimedGate } from '../../hooks/useServerTimedGate';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBursts } from '../../components/ui/ReactionBar';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';

export function DisplayResults(): React.JSX.Element {
  const { snapshot, status, errorMessage, clearError, send } = useGame();
  const [advancePending, setAdvancePending] = useState(false);
  const priorStatusRef = useRef(status);
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(
    result,
    snapshot?.turnToken ?? 0,
    snapshot?.deadlineMs,
    snapshot?.settings.resultsSeconds
  );

  useEffect(() => {
    const priorStatus = priorStatusRef.current;
    priorStatusRef.current = status;
    if (shouldResetPendingServerAction(advancePending, status, errorMessage)) {
      setAdvancePending(false);
      return;
    }
    if (shouldClearPendingAdvanceAfterReconnect(advancePending, priorStatus, status, errorMessage)) {
      setAdvancePending(false);
    }
  }, [advancePending, errorMessage, status]);

  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <>
      <div className="display-grid display-grid-results">
        {result ? (
          <ResultsPanel
            result={result}
            drawing={snapshot.currentDrawing}
            stage={stage}
            includeDrawing
            practice={(snapshot.gameMode ?? 'party') === 'practice'}
            controls={
              stage === 'deltas' || stage === 'complete' ? (
                <div className="advance-panel result-advance">
                  <Deadline />
                  {complete ? (
                    <Button
                      id="advance-button"
                      className="tv-action-fallback tv-icon-fallback"
                      variant="ghost"
                      icon={ArrowRight}
                      aria-label="Continue from TV (fallback)"
                      aria-busy={advancePending || undefined}
                      disabled={advancePending}
                      onClick={() => {
                        clearError();
                        if (send({ type: 'startGame' })) setAdvancePending(true);
                      }}
                    />
                  ) : null}
                </div>
              ) : undefined
            }
          />
        ) : (
          <GlassPanel className="results-panel">Waiting for results...</GlassPanel>
        )}
      </div>
      <ReactionBursts />
    </>
  );
}

export function DisplayFinal(): React.JSX.Element {
  const { snapshot, status, errorMessage, clearError, send, setErrorMessage } = useGame();
  const [advancePending, setAdvancePending] = useState<ReplayAction | null>(null);
  const priorStatusRef = useRef(status);
  const replay = snapshot ? finalReplayPlan(snapshot) : null;
  const replayReady = useServerTimedGate(
    snapshot?.phase === 'finalScores'
      ? `${snapshot.roomCode}:${snapshot.phase}:${snapshot.turnToken}`
      : '',
    snapshot?.deadlineMs,
    snapshot?.serverNowMs
  );

  useEffect(() => {
    const priorStatus = priorStatusRef.current;
    priorStatusRef.current = status;
    if (
      shouldResetPendingServerAction(
        Boolean(advancePending),
        status,
        errorMessage,
        replay?.action === advancePending
      )
    ) {
      setAdvancePending(null);
      return;
    }
    if (
      advancePending &&
      shouldClearPendingAdvanceAfterReconnect(
        true,
        priorStatus,
        status,
        errorMessage
      )
    ) {
      setAdvancePending(null);
    }
  }, [advancePending, errorMessage, replay?.action, status]);

  if (!snapshot) {
    return <GlassPanel />;
  }

  const practice = (snapshot.gameMode ?? 'party') === 'practice';

  return (
    <>
      <div className="display-grid display-grid-finalScores">
        <ScoresPanel
          scores={snapshot.finalScores}
          podium
          role="display"
          practice={practice}
          shareReady={replayReady}
          onShareFailed={() => setErrorMessage('Could not export the podium card.')}
          actions={
            replay?.action && replayReady ? (
              <Button
                id="advance-button"
                className="tv-action-fallback tv-icon-fallback"
                variant="ghost"
                icon={replay.label === 'Start Party' ? Play : RotateCcw}
                aria-label={`${replay.label} from TV (fallback)`}
                aria-busy={Boolean(advancePending) || undefined}
                disabled={Boolean(advancePending)}
                onClick={() => {
                  const action = replay.action;
                  if (!action) return;
                  clearError();
                  const sent =
                    action === 'practice'
                      ? send({ type: 'startPractice' })
                      : send({ type: 'startGame' });
                  if (sent) setAdvancePending(action);
                }}
              />
            ) : null
          }
        />
      </div>
      <ReactionBursts />
    </>
  );
}
