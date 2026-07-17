import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './protocol';
import { createEmptyDrawing, drawingTestExports, estimateDrawingBytes } from './drawing';

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

  it('clamps coordinates and rejects non-finite input', () => {
    expect(drawingTestExports.clamp(-1, 0, 10)).toBe(0);
    expect(drawingTestExports.clamp(12, 0, 10)).toBe(10);
    expect(drawingTestExports.clamp(5, 0, 10)).toBe(5);
    expect(drawingTestExports.clamp(Number.NaN, 0, 10)).toBe(0);
    expect(drawingTestExports.clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(0);
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
});
