import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide';
import { useGame } from '../../app/GameProvider';
import {
  finalReplayPlan,
  shouldClearPendingAdvanceAfterReconnect,
  shouldResetPendingServerAction,
  type ReplayAction
} from '../../controller';
import { useRevealStage } from '../../hooks/useRevealStage';
import { useServerTimedGate } from '../../hooks/useServerTimedGate';
import { isSelfHost } from '../../host';
import { Button } from '../../components/ui/Button';
import {
  groupScoreEvents,
  scoreEventText
} from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot, clientId, status, errorMessage, clearError, send } = useGame();
  const [advancePending, setAdvancePending] = useState(false);
  const result = snapshot?.roundResult;
  const { complete } = useRevealStage(
    result,
    snapshot?.turnToken ?? 0,
    snapshot?.deadlineMs,
    snapshot?.settings.resultsSeconds
  );
  const players = snapshot?.players ?? [];
  const self = players.find((player) => player.id === clientId);
  const isHost = isSelfHost(players, clientId ?? '');
  const spectator = Boolean(self?.spectator);
  const practice = (snapshot?.gameMode ?? 'party') === 'practice';
  const personalDelta = result?.scoreDeltas.find((delta) => delta.playerId === clientId);
  const personalEvents = groupScoreEvents(
    result?.scoreEvents?.filter((event) => event.playerId === clientId) ?? []
  );
  const scored =
    personalEvents.length > 0 || Boolean(personalDelta && personalDelta.delta > 0);
  const showPersonalScore = Boolean(result) && complete && !spectator && !practice && scored;
  const scoreAfter = personalDelta?.scoreAfter ?? self?.score;
  const priorStatusRef = useRef(status);

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

  return (
    <Shell title="Results">
      <GlassPanel className="player-result-companion">
        <h2>Look up</h2>

        {showPersonalScore ? (
          <div className="personal-score" role="status" aria-live="polite">
            {personalEvents.length > 0 ? (
              <div className="score-events">
                {personalEvents.map((event) => (
                  <div key={`${event.kind}:${event.playerId}`} className="score-event causal-score-event">
                    <span>{scoreEventText(event)}</span>
                    <span className="pill score-delta">+{event.points}</span>
                  </div>
                ))}
                {scoreAfter === undefined ? null : (
                  <span className="pill score-total">{scoreAfter} total</span>
                )}
              </div>
            ) : (
              <p className="success-box">
                +{personalDelta?.delta}
                {scoreAfter === undefined ? '' : ` · ${scoreAfter} total`}
              </p>
            )}
          </div>
        ) : null}
      </GlassPanel>

      {isHost && complete ? (
        <GlassPanel className="advance-panel result-phone-advance" tone="soft">
          <Button
            className="spotlight-button"
            wide
            disabled={advancePending}
            onClick={() => {
              clearError();
              if (send({ type: 'startGame' })) setAdvancePending(true);
            }}
          >
            {advancePending ? 'Continuing…' : 'Continue'}
          </Button>
        </GlassPanel>
      ) : null}
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot, clientId, status, errorMessage, clearError, send } = useGame();
  const [advancePending, setAdvancePending] = useState<ReplayAction | null>(null);
  const priorStatusRef = useRef(status);
  const scores = snapshot?.finalScores ?? [];
  const isHost = isSelfHost(snapshot?.players ?? [], clientId ?? '');
  const practice = (snapshot?.gameMode ?? 'party') === 'practice';
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

  return (
    <Shell title={practice ? 'Practice Complete' : 'Final Scores'}>
      <ScoresPanel
        scores={scores}
        podium
        role="player"
        practice={practice}
      />

      {isHost && replay?.action && replayReady ? (
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <Button
            className="spotlight-button"
            wide
            icon={RotateCcw}
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
          >
            {advancePending ? 'Starting…' : replay.label}
          </Button>
        </GlassPanel>
      ) : null}
      {isHost && !replay?.action && replay?.guidance ? (
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <p className="muted">{replay.guidance}</p>
        </GlassPanel>
      ) : null}
    </Shell>
  );
}
