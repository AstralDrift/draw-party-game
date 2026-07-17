import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DrawingPad, renderDrawing } from '../../drawing';
import type { DrawingDoc } from '../../protocol';

interface DrawingPadHostProps {
  onReadyChange: (ready: boolean) => void;
  padRef: React.MutableRefObject<DrawingPad | null>;
  children?: ReactNode;
}

export function DrawingPadHost({
  onReadyChange,
  padRef,
  children
}: DrawingPadHostProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const submitSlotRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const submitSlot = document.createElement('div');
    submitSlot.className = 'submit-slot-host';
    submitSlotRef.current = submitSlot;

    const pad = new DrawingPad(() => {
      onReadyChange(pad.hasInk());
    }, submitSlot);
    padRef.current = pad;
    host.replaceChildren(pad.root);
    onReadyChange(pad.hasInk());
    setPortalTarget(submitSlot);

    return () => {
      padRef.current = null;
      submitSlotRef.current = null;
      setPortalTarget(null);
      host.replaceChildren();
    };
  }, [onReadyChange, padRef]);

  return (
    <>
      <div ref={hostRef} className="drawing-pad-host" />
      {portalTarget && children ? createPortal(children, portalTarget) : null}
    </>
  );
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
