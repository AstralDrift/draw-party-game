import { useEffect, useRef } from 'react';
import { DrawingPad, renderDrawing } from '../../drawing';
import type { DrawingDoc } from '../../protocol';

interface DrawingPadHostProps {
  onReadyChange: (ready: boolean) => void;
  padRef: React.MutableRefObject<DrawingPad | null>;
}

export function DrawingPadHost({ onReadyChange, padRef }: DrawingPadHostProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const pad = new DrawingPad(() => {
      onReadyChange(pad.hasInk());
    });
    padRef.current = pad;
    host.replaceChildren(pad.root);
    onReadyChange(pad.hasInk());

    return () => {
      padRef.current = null;
      host.replaceChildren();
    };
  }, [onReadyChange, padRef]);

  return <div ref={hostRef} className="drawing-pad-host" />;
}

interface DrawingCanvasProps {
  drawing: DrawingDoc | null | undefined;
  className?: string;
}

export function DrawingCanvas({
  drawing,
  className = 'reveal-canvas'
}: DrawingCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    renderDrawing(canvas, drawing);
  }, [drawing]);

  return <canvas ref={canvasRef} className={className} width={1024} height={768} />;
}
