// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './protocol';
import {
  DrawingPad,
  cloneValidDrawing,
  createEmptyDrawing,
  drawingTestExports,
  estimateDrawingBytes,
  renderDrawing
} from './drawing';

afterEach(() => {
  vi.restoreAllMocks();
});

function createPointerPad(portrait = false) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    ({
      matches: portrait && query === '(max-width: 699px) and (orientation: portrait)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }) as unknown as MediaQueryList
  );
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    transform: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn()
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const onChange = vi.fn();
  const pad = new DrawingPad(onChange);
  const canvas = pad.root.querySelector<HTMLCanvasElement>('canvas.draw-canvas')!;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
  );
  const fire = (type: string, x: number, y: number, pointerId = 1) => {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'pen',
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: x,
      clientY: y
    }));
  };
  return { pad, context, fire, onChange };
}

describe('drawing utilities', () => {
  it('creates protocol-sized empty drawings', () => {
    expect(createEmptyDrawing()).toEqual({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      strokes: []
    });
  });

  it('keeps max-limit vector payloads under a hard byte budget', () => {
    const drawing = createEmptyDrawing();
    for (let strokeIndex = 0; strokeIndex < drawingTestExports.MAX_STROKES; strokeIndex += 1) {
      drawing.strokes.push({
        color: '#111111',
        size: 6,
        points: Array.from({ length: drawingTestExports.MAX_POINTS_PER_STROKE }, (_, index) => ({
          x: index,
          y: strokeIndex
        }))
      });
    }
    // Worst-case compact stroke doc must stay well under a megabyte for WS frames.
    expect(estimateDrawingBytes(drawing)).toBeLessThan(1024 * 1024);
  });

  it('validates and deep-clones only drawings this pad can produce', () => {
    const drawing = {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      strokes: [
        {
          color: '#111111',
          size: 6,
          points: [
            { x: 0, y: 0 },
            { x: CANVAS_WIDTH, y: CANVAS_HEIGHT }
          ]
        }
      ]
    };
    const cloned = cloneValidDrawing(drawing);

    expect(cloned).toEqual(drawing);
    expect(cloned).not.toBe(drawing);
    expect(cloned?.strokes[0]).not.toBe(drawing.strokes[0]);
    expect(cloned?.strokes[0]?.points[0]).not.toBe(drawing.strokes[0]?.points[0]);

    drawing.strokes[0]!.points[0]!.x = 12;
    expect(cloned?.strokes[0]?.points[0]?.x).toBe(0);

    const invalidDrawings = [
      { ...drawing, width: CANVAS_WIDTH - 1 },
      { ...drawing, height: CANVAS_HEIGHT - 1 },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], color: '#abcdef' }]
      },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], size: 5 }]
      },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], points: [{ x: 1, y: 1 }] }]
      },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }]
      },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], points: [{ x: 0, y: Number.NaN }, { x: 1, y: 1 }] }]
      },
      {
        ...drawing,
        strokes: [{ ...drawing.strokes[0], points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }] }]
      },
      {
        ...drawing,
        strokes: Array.from({ length: drawingTestExports.MAX_STROKES + 1 }, () => drawing.strokes[0])
      },
      {
        ...drawing,
        strokes: [
          {
            ...drawing.strokes[0],
            points: Array.from({ length: drawingTestExports.MAX_POINTS_PER_STROKE + 1 }, () => ({
              x: 1,
              y: 1
            }))
          }
        ]
      }
    ];

    for (const invalid of invalidDrawings) {
      expect(cloneValidDrawing(invalid)).toBeNull();
    }
  });

  it('clamps coordinates and rejects non-finite input', () => {
    expect(drawingTestExports.clamp(-1, 0, 10)).toBe(0);
    expect(drawingTestExports.clamp(12, 0, 10)).toBe(10);
    expect(drawingTestExports.clamp(5, 0, 10)).toBe(5);
    expect(drawingTestExports.clamp(Number.NaN, 0, 10)).toBe(0);
    expect(drawingTestExports.clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(0);
  });

  it('maps portrait touches into a centered upright frame in the canonical document', () => {
    const rect = { left: 10, top: 20, right: 310, width: 300, height: 400 };
    const map = (clientX: number, clientY: number) =>
      drawingTestExports.mapPointerToDrawingPoint(clientX, clientY, rect, true);

    expect(map(10, 20)).toEqual({ x: 224, y: 0 });
    expect(map(310, 20)).toEqual({ x: 800, y: 0 });
    expect(map(10, 420)).toEqual({ x: 224, y: 768 });
    expect(map(310, 420)).toEqual({ x: 800, y: 768 });
    expect(map(160, 220)).toEqual({ x: 512, y: 384 });
  });

  it('inverse-transforms canonical portrait points for the rotated live preview', () => {
    const rect = { left: 10, top: 20, right: 310, width: 300, height: 400 };
    const screenPoints = [
      { x: 10, y: 20 },
      { x: 310, y: 20 },
      { x: 10, y: 420 },
      { x: 310, y: 420 },
      { x: 85, y: 120 }
    ];

    for (const screenPoint of screenPoints) {
      const canonical = drawingTestExports.mapPointerToDrawingPoint(screenPoint.x, screenPoint.y, rect, true);
      const preview = drawingTestExports.mapDrawingPointToPortraitPreview(canonical);
      const recoveredScreenRatio = {
        x: (CANVAS_HEIGHT - preview.y) / CANVAS_HEIGHT,
        y: preview.x / CANVAS_WIDTH
      };

      expect(recoveredScreenRatio.x).toBeCloseTo((screenPoint.x - rect.left) / rect.width, 3);
      expect(recoveredScreenRatio.y).toBeCloseTo((screenPoint.y - rect.top) / rect.height, 3);
    }
  });

  it('keeps asymmetric portrait landmarks upright in stored and TV coordinates', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      ({
        matches: query === '(max-width: 699px) and (orientation: portrait)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => true)
      }) as unknown as MediaQueryList
    );

    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter'
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const pad = new DrawingPad(vi.fn());
    const canvas = pad.root.querySelector('canvas.draw-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Drawing pad must include its canvas.');
    }
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 400 })
    );

    const drawStroke = (
      pointerId: number,
      start: { x: number; y: number },
      end: { x: number; y: number }
    ) => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId,
          buttons: 1,
          clientX: start.x,
          clientY: start.y
        })
      );
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId,
          buttons: 1,
          clientX: end.x,
          clientY: end.y
        })
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId,
          buttons: 0,
          clientX: end.x,
          clientY: end.y
        })
      );
    };

    // A horizontal mark near the phone's top and a vertical mark near its left
    // make a rotation or mirror regression unambiguous.
    drawStroke(1, { x: 75, y: 40 }, { x: 225, y: 40 });
    drawStroke(2, { x: 30, y: 100 }, { x: 30, y: 300 });

    const stored = pad.getDrawing();
    expect(stored.strokes[0]?.points).toEqual([
      { x: 368, y: 77 },
      { x: 656, y: 77 }
    ]);
    expect(stored.strokes[1]?.points).toEqual([
      { x: 282, y: 192 },
      { x: 282, y: 576 }
    ]);

    vi.mocked(context.transform).mockClear();
    vi.mocked(context.moveTo).mockClear();
    vi.mocked(context.lineTo).mockClear();
    renderDrawing(document.createElement('canvas'), stored);

    expect(context.transform).not.toHaveBeenCalled();
    expect(context.moveTo).toHaveBeenNthCalledWith(1, 368, 77);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 656, 77);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 282, 192);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 282, 576);

    pad.destroy();
  });

  it('keeps landscape and tablet touches mapped across the full canonical canvas', () => {
    const rect = { left: 10, top: 20, right: 410, width: 400, height: 300 };
    const map = (clientX: number, clientY: number) =>
      drawingTestExports.mapPointerToDrawingPoint(clientX, clientY, rect, false);

    expect(map(10, 20)).toEqual({ x: 0, y: 0 });
    expect(map(410, 320)).toEqual({ x: 1024, y: 768 });
    expect(map(210, 170)).toEqual({ x: 512, y: 384 });
  });

  it('serializes taps as identical points and recognizes live and submitted dots', () => {
    const tap = {
      color: '#111111',
      size: 6,
      points: [{ x: 123, y: 456 }]
    };
    const completed = drawingTestExports.completeTapStroke(tap);

    expect(completed.points).toEqual([
      { x: 123, y: 456 },
      { x: 123, y: 456 }
    ]);
    expect(completed.points[0]).not.toBe(completed.points[1]);
    expect(tap.points).toHaveLength(1);
    expect(drawingTestExports.isDotStroke(tap)).toBe(true);
    expect(drawingTestExports.isDotStroke(completed)).toBe(true);
    expect(
      drawingTestExports.isDotStroke({
        ...tap,
        points: [
          { x: 123, y: 456 },
          { x: 124, y: 456 }
        ]
      })
    ).toBe(false);
  });

  it('locks every drawing mutation while sending and restores intact ink for retry', () => {
    const mediaLists: Array<MediaQueryList & { removeEventListener: ReturnType<typeof vi.fn> }> = [];
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const media = {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => true)
      } as unknown as MediaQueryList & { removeEventListener: ReturnType<typeof vi.fn> };
      mediaLists.push(media);
      return media;
    });

    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter'
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const onChange = vi.fn();
    const pad = new DrawingPad(onChange);
    const canvas = pad.root.querySelector('canvas.draw-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Drawing pad must include its canvas.');
    }
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 300 })
    );
    const tap = (pointerId: number, clientX: number, clientY: number) => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId,
          buttons: 1,
          clientX,
          clientY
        })
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId,
          buttons: 0,
          clientX,
          clientY
        })
      );
    };

    tap(1, 100, 100);
    expect(pad.getDrawing().strokes).toHaveLength(1);
    const captured = pad.getDrawing();

    pad.setLocked(true);
    expect(pad.root.classList.contains('is-locked')).toBe(true);
    expect(pad.root.getAttribute('aria-disabled')).toBe('true');
    expect(pad.root.getAttribute('aria-busy')).toBe('true');
    expect(canvas.getAttribute('aria-disabled')).toBe('true');
    expect(canvas.tabIndex).toBe(-1);
    for (const button of pad.root.querySelectorAll('button')) {
      expect(button.disabled).toBe(true);
    }

    tap(2, 300, 200);
    expect(pad.getDrawing()).toEqual(captured);

    pad.setLocked(false);
    expect(pad.root.classList.contains('is-locked')).toBe(false);
    expect(pad.root.getAttribute('aria-disabled')).toBe('false');
    expect(pad.root.hasAttribute('aria-busy')).toBe(false);
    expect(canvas.getAttribute('aria-disabled')).toBe('false');
    expect(canvas.tabIndex).toBe(0);
    for (const button of pad.root.querySelectorAll('button')) {
      expect(button.disabled).toBe(false);
    }
    expect(pad.getDrawing()).toEqual(captured);

    tap(3, 300, 200);
    expect(pad.getDrawing().strokes).toHaveLength(2);
    expect(onChange).toHaveBeenCalledTimes(2);

    const restored = captured;
    expect(pad.restoreDrawing(restored)).toBe(true);
    restored.strokes[0]!.points[0]!.x = 999;
    expect(pad.getDrawing().strokes[0]?.points[0]?.x).not.toBe(999);
    expect(pad.root.querySelector('.draw-status')?.textContent).toBe('1 stroke');
    expect(pad.root.querySelector('.tools-summary')?.getAttribute('aria-label')).toBe(
      'Open drawing tools, black, 6px'
    );
    expect(pad.root.querySelector('.tools-summary')?.textContent).not.toContain('Tools');

    const undo = pad.root.querySelector<HTMLButtonElement>('button[aria-label="Undo last stroke"]');
    undo?.click();
    expect(pad.hasInk()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(3);

    expect(pad.restoreDrawing(captured)).toBe(true);
    const clear = pad.root.querySelector<HTMLButtonElement>('button[aria-label="Clear drawing"]');
    clear?.click();
    pad.root.querySelector<HTMLButtonElement>('button[aria-label="Tap again to clear drawing"]')?.click();
    expect(pad.hasInk()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(4);

    pad.destroy();
    expect(mediaLists[0]?.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mediaLists[1]?.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('moves compact phone tools into a provided slot instead of covering the pad', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      ({
        matches: query === '(max-width: 699px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => true)
      }) as unknown as MediaQueryList
    );

    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter'
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const slot = document.createElement('div');
    const pad = new DrawingPad(vi.fn(), undefined, slot);
    expect(slot.querySelector('.tools-drawer')).not.toBeNull();
    expect(pad.root.querySelector('.tools-drawer')).toBeNull();
    pad.destroy();
    expect(slot.querySelector('.tools-drawer')).toBeNull();
  });

  it('caps dense stroke points while preserving endpoints and edge lengths', () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: index, y: index * 2 }));
    const simplified = drawingTestExports.simplifyStrokePoints(
      points,
      drawingTestExports.MAX_POINTS_PER_STROKE
    );
    expect(simplified).toHaveLength(drawingTestExports.MAX_POINTS_PER_STROKE);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));

    const exact = points.slice(0, drawingTestExports.MAX_POINTS_PER_STROKE);
    expect(drawingTestExports.simplifyStrokePoints(exact, drawingTestExports.MAX_POINTS_PER_STROKE)).toHaveLength(
      drawingTestExports.MAX_POINTS_PER_STROKE
    );

    expect(drawingTestExports.simplifyStrokePoints([], 180)).toEqual([]);
    expect(drawingTestExports.simplifyStrokePoints([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }]);
    expect(drawingTestExports.simplifyStrokePoints(points, 1)).toEqual([points[0]]);

    const odd = Array.from({ length: 181 }, (_, index) => ({ x: index, y: index }));
    const oddSimplified = drawingTestExports.simplifyStrokePoints(odd, 180);
    expect(oddSimplified).toHaveLength(180);
    expect(oddSimplified[0]).toEqual(odd[0]);
    expect(oddSimplified.at(-1)).toEqual(odd.at(-1));
  });

  it('keeps capturing a long gesture through multiple bounded compactions and includes its release endpoint', () => {
    const { pad, context, fire, onChange } = createPointerPad();
    fire('pointerdown', 0, 0);
    for (let index = 1; index <= 900; index += 1) {
      const x = (index % 100) * 8;
      const y = Math.floor(index / 100) * 60;
      context.lineTo.mockClear();
      fire('pointermove', x, y);
      expect(context.lineTo).toHaveBeenLastCalledWith(x, y);
      expect(context.lineTo.mock.calls.length).toBeLessThan(360);
    }
    expect(pad.root.querySelector('.draw-status')?.textContent).not.toContain('full');
    expect(onChange).not.toHaveBeenCalled();

    fire('pointerup', 1000, 700);
    const drawing = pad.getDrawing();
    expect(drawing.strokes).toHaveLength(1);
    expect(drawing.strokes[0]?.points).toHaveLength(180);
    expect(drawing.strokes[0]?.points[0]).toEqual({ x: 0, y: 0 });
    expect(drawing.strokes[0]?.points.at(-1)).toEqual({ x: 1000, y: 700 });
    expect(drawing.strokes[0]?.points.some((point) => point.y === 480)).toBe(true);
    expect(cloneValidDrawing(drawing)).toEqual(drawing);
    expect(onChange).toHaveBeenCalledTimes(1);

    pad.root.querySelector<HTMLButtonElement>('button[aria-label="Undo last stroke"]')?.click();
    expect(pad.hasInk()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    pad.destroy();
  });

  it.each([
    { portrait: false, firstX: 0, lastX: 1 },
    { portrait: true, firstX: 224, lastX: 225 }
  ])('captures a distinct release below the movement threshold (portrait: $portrait)', ({ portrait, firstX, lastX }) => {
    const { pad, fire } = createPointerPad(portrait);
    fire('pointerdown', 0, 10);
    fire('pointerup', 1, 10);
    expect(pad.getDrawing().strokes[0]?.points).toEqual([
      { x: firstX, y: 10 },
      { x: lastX, y: 10 }
    ]);
    pad.destroy();
  });

  it('finishes cancellation at the last captured sample and allows a new pointer to draw', () => {
    const { pad, fire, onChange } = createPointerPad();
    fire('pointerdown', 10, 20);
    fire('pointermove', 30, 40);
    fire('pointercancel', 0, 0);
    fire('pointerup', 100, 100);
    expect(pad.getDrawing().strokes[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 }
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);

    fire('pointerdown', 50, 60, 2);
    fire('pointercancel', 0, 0, 2);
    expect(pad.getDrawing().strokes[1]?.points).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 60 }
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
    pad.destroy();
  });
});
