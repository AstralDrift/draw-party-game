import { useCallback, useRef, useState } from 'react';
import { Send } from 'lucide';
import { useGame } from '../../app/GameProvider';
import type { DrawingPad } from '../../drawing';
import { playerActionHint } from '../../polish';
import { playCue } from '../../sound';
import { Button } from '../../components/ui/Button';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingPadHost } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerDrawing(): React.JSX.Element {
  const { snapshot, clientId, prompt, send, setErrorMessage, haptic } = useGame();
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

  const submitted = snapshot.drawingSubmittedIds.includes(clientId);
  const turnToken = snapshot.turnToken;

  const heading = (
    <div className="turn-header">
      <div className="turn-copy">
        <p className="eyebrow">
          Round {snapshot.currentRound} of {snapshot.totalRounds}
        </p>
        <div className="prompt" id="prompt-text">
          {prompt ? `Draw: ${prompt}` : 'Waiting for prompt...'}
        </div>
      </div>
      <Deadline />
    </div>
  );

  if (submitted) {
    return (
      <Shell title="Draw">
        <GlassPanel className="play-panel player-turn-panel drawing-turn">
          {heading}
          <p className="action-hint">{playerActionHint('drawing', false)}</p>
          <div className="success-box">Drawing submitted. Watch the TV.</div>
        </GlassPanel>
      </Shell>
    );
  }

  return (
    <Shell title="Draw">
      <GlassPanel className="play-panel player-turn-panel drawing-turn">
        {heading}
        <p className="action-hint">{playerActionHint('drawing', false)}</p>
        <DrawingPadHost padRef={padRef} onReadyChange={onReadyChange}>
          <div className={`submit-dock${ready ? ' is-ready' : ''}`}>
            <Button
              wide
              icon={Send}
              disabled={!ready}
              onClick={() => {
                const pad = padRef.current;
                if (!pad?.hasInk()) {
                  setErrorMessage('Draw at least one stroke before submitting.');
                  return;
                }
                send({ type: 'submitDrawing', turnToken, drawing: pad.getDrawing() });
                playCue('submit');
                haptic(12);
              }}
            >
              Submit Drawing
            </Button>
            <p className="submit-help">{ready ? 'Ready when you are.' : 'Draw one stroke to unlock submit.'}</p>
          </div>
        </DrawingPadHost>
      </GlassPanel>
    </Shell>
  );
}
