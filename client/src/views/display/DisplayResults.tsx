import { useEffect, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import {
  finalReplayPlan,
  shouldResetPendingServerAction,
  type ReplayAction
} from '../../controller';
import { useRevealStage } from '../../hooks/useRevealStage';
import { rematchPrompt } from '../../polish';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBursts } from '../../components/ui/ReactionBar';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';

export function DisplayResults(): React.JSX.Element {
  const { snapshot, status, errorMessage, clearError, send } = useGame();
  const [advancePending, setAdvancePending] = useState(false);
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(
    result,
    snapshot?.turnToken ?? 0,
    snapshot?.deadlineMs,
    snapshot?.settings.resultsSeconds
  );

  useEffect(() => {
    if (shouldResetPendingServerAction(advancePending, status, errorMessage)) {
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
              <div className="advance-panel result-advance">
                <p className="eyebrow">Next up in</p>
                <Deadline />
                <Button
                  id="advance-button"
                  variant="secondary"
                  wide
                  disabled={!complete || advancePending}
                  onClick={() => {
                    clearError();
                    if (send({ type: 'startGame' })) setAdvancePending(true);
                  }}
                >
                  {advancePending ? 'Continuing…' : 'Continue'}
                </Button>
                <p className="muted">Host phone can Continue early, or the game moves on at zero.</p>
              </div>
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
  const replay = snapshot ? finalReplayPlan(snapshot) : null;

  useEffect(() => {
    if (
      shouldResetPendingServerAction(
        Boolean(advancePending),
        status,
        errorMessage,
        replay?.action === advancePending
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
          onShareFailed={() => setErrorMessage('Could not export the podium card.')}
        />
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <p className="eyebrow">{practice ? 'Practice · scores off' : 'One more round?'}</p>
          <h2 className="encore-title">{rematchPrompt(snapshot.finalScores)}</h2>
          <Button
            id="advance-button"
            variant="secondary"
            wide
            disabled={!replay?.action || Boolean(advancePending)}
            onClick={() => {
              const action = replay?.action;
              if (!action) return;
              clearError();
              const sent =
                action === 'practice'
                  ? send({ type: 'startPractice' })
                  : send({ type: 'startGame' });
              if (sent) setAdvancePending(action);
            }}
          >
            {advancePending ? 'Starting…' : replay?.label}
          </Button>
          <p className="muted">{replay?.guidance}</p>
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}
