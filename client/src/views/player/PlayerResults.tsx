import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide';
import { useGame } from '../../app/GameProvider';
import {
  finalReplayPlan,
  shouldResetPendingServerAction,
  type ReplayAction
} from '../../controller';
import { stageVisible, useRevealStage } from '../../hooks/useRevealStage';
import { useServerTimedGate } from '../../hooks/useServerTimedGate';
import { isSelfHost } from '../../host';
import { rematchPrompt } from '../../polish';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import {
  groupScoreEvents,
  scoreEventText
} from '../../components/ui/ResultsPanel';
import { ReactionBar } from '../../components/ui/ReactionBar';
import { ScoresPanel } from '../../components/ui/ScoresPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot, clientId, status, errorMessage, clearError, send } = useGame();
  const [advancePending, setAdvancePending] = useState(false);
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(
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
  const scoresVisible = Boolean(result) && stageVisible(stage, 'deltas');
  const scoreAfter = personalDelta?.scoreAfter ?? self?.score;

  useEffect(() => {
    if (shouldResetPendingServerAction(advancePending, status, errorMessage)) {
      setAdvancePending(false);
    }
  }, [advancePending, errorMessage, status]);

  return (
    <Shell title="Results">
      <GlassPanel className="player-result-companion">
        <p className="eyebrow">{practice ? 'Practice · scores off' : 'Reveal time'}</p>
        <h2>Look up at the TV for the reveal</h2>
        <p className="muted">Your phone is the controller. The punchline is on the big screen.</p>

        {scoresVisible && !spectator ? (
          <div className="personal-score" role="status" aria-live="polite">
            {practice ? (
              <p className="success-box">Practice complete. Scores stay off.</p>
            ) : personalEvents.length > 0 ? (
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
            ) : personalDelta && personalDelta.delta > 0 ? (
              <p className="success-box">
                +{personalDelta.delta}
                {scoreAfter === undefined ? '' : ` · ${scoreAfter} total`}
              </p>
            ) : (
              <p className="muted">No points this reveal.</p>
            )}
          </div>
        ) : null}

        <ReactionBar />
      </GlassPanel>

      {isHost ? (
        <GlassPanel className="advance-panel result-phone-advance" tone="soft">
          <p className="eyebrow">Next up in</p>
          <Deadline />
          <Button
            className="spotlight-button"
            wide
            disabled={!complete || advancePending}
            onClick={() => {
              clearError();
              if (send({ type: 'startGame' })) setAdvancePending(true);
            }}
          >
            {advancePending ? 'Continuing…' : 'Continue'}
          </Button>
          <p className="muted">Or wait — the game moves on when the timer hits zero.</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="advance-panel" tone="soft">
          <p className="muted">Host decides—keep this tab open.</p>
        </GlassPanel>
      )}
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot, clientId, status, errorMessage, clearError, send, setErrorMessage } = useGame();
  const [advancePending, setAdvancePending] = useState<ReplayAction | null>(null);
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

  return (
    <Shell title={practice ? 'Practice Complete' : 'Final Scores'}>
      <ScoresPanel
        scores={scores}
        podium
        role="player"
        practice={practice}
        onShareFailed={() => setErrorMessage('Could not export the podium card.')}
      />

      {isHost ? (
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <p className="eyebrow">{practice ? 'Practice · scores off' : 'Host controls'}</p>
          <h2 className="encore-title">{rematchPrompt(scores)}</h2>
          <Button
            className="spotlight-button"
            wide
            icon={RotateCcw}
            disabled={!replay?.action || !replayReady || Boolean(advancePending)}
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
            {advancePending
              ? 'Starting…'
              : !replayReady && replay?.action
                ? 'Podium first…'
                : replay?.label}
          </Button>
          <p className="muted">
            {replayReady ? replay?.guidance : 'Give the podium its moment. Replay unlocks shortly.'}
          </p>
        </GlassPanel>
      ) : (
        <GlassPanel className="advance-panel" tone="soft">
          <p className="muted">Host decides. {replay?.guidance}</p>
        </GlassPanel>
      )}
    </Shell>
  );
}
