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

  it('keeps vector payloads compact for typical drawings', () => {
    const drawing = createEmptyDrawing();
    for (let strokeIndex = 0; strokeIndex < 20; strokeIndex += 1) {
      drawing.strokes.push({
        color: '#111111',
        size: 6,
        points: Array.from({ length: 20 }, (_, index) => ({
          x: index * 4,
          y: strokeIndex * 8
        }))
      });
    }
    expect(estimateDrawingBytes(drawing)).toBeLessThan(80 * 1024);
  });

  it('clamps coordinates into the fixed canvas', () => {
    expect(drawingTestExports.clamp(-1, 0, 10)).toBe(0);
    expect(drawingTestExports.clamp(12, 0, 10)).toBe(10);
    expect(drawingTestExports.clamp(5, 0, 10)).toBe(5);
  });

  it('caps dense stroke points while preserving endpoints', () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: index, y: index * 2 }));

    const simplified = drawingTestExports.simplifyStrokePoints(
      points,
      drawingTestExports.MAX_POINTS_PER_STROKE
    );

    expect(simplified).toHaveLength(drawingTestExports.MAX_POINTS_PER_STROKE);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));
  });
});
