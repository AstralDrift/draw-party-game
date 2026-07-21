import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DrawingPad, renderDrawing } from '../../drawing';
import type { DrawingDoc } from '../../protocol';

interface DrawingPadHostProps {
  onReadyChange: (ready: boolean) => void;
  onDrawingChange?: (drawing: DrawingDoc) => void;
  padRef: React.MutableRefObject<DrawingPad | null>;
  initialDrawing?: DrawingDoc | null;
  locked?: boolean;
  children?: ReactNode;
}

export function DrawingPadHost({
  onReadyChange,
  onDrawingChange,
  padRef,
  initialDrawing = null,
  locked = false,
  children
}: DrawingPadHostProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialDrawingRef = useRef(initialDrawing);
  const onReadyChangeRef = useRef(onReadyChange);
  const onDrawingChangeRef = useRef(onDrawingChange);
  const lockedRef = useRef(locked);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    onReadyChangeRef.current = onReadyChange;
    onDrawingChangeRef.current = onDrawingChange;
  }, [onDrawingChange, onReadyChange]);

  useLayoutEffect(() => {
    lockedRef.current = locked;
    padRef.current?.setLocked(locked);
  }, [locked, padRef]);

  // Mount the imperative DrawingPad once. Callbacks stay in refs so ready/submit
  // re-renders never destroy live ink. flushSync portals the submit dock before paint
  // so the canvas layout is stable for the first pointer stroke.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const submitSlot = document.createElement('div');
    submitSlot.className = 'submit-slot-host';

    const pad = new DrawingPad(() => {
      onReadyChangeRef.current(pad.hasInk());
      onDrawingChangeRef.current?.(pad.getDrawing());
    }, submitSlot);
    if (initialDrawingRef.current) {
      pad.restoreDrawing(initialDrawingRef.current);
    }
    pad.setLocked(lockedRef.current);
    padRef.current = pad;
    host.replaceChildren(pad.root);
    flushSync(() => {
      setPortalTarget(submitSlot);
    });
    onReadyChangeRef.current(pad.hasInk());

    return () => {
      pad.destroy();
      padRef.current = null;
      flushSync(() => {
        setPortalTarget(null);
      });
      host.replaceChildren();
    };
  }, [padRef]);

  return (
    <>
      <div ref={hostRef} className="drawing-pad-host" aria-busy={locked || undefined} />
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
