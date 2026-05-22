import { Trash2, Undo2, createElement as createIconElement, type IconNode } from 'lucide';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type DrawingDoc, type Point, type Stroke } from './protocol';

const COLORS = ['#111111', '#ff595e', '#ffca3a', '#34d399', '#1982c4', '#6a4c93', '#f957a8', '#ffffff'];
const SIZES = [3, 6, 10, 16];
const COLOR_LABELS: Record<string, string> = {
  '#111111': 'black ink',
  '#ff595e': 'red ink',
  '#ffca3a': 'yellow ink',
  '#34d399': 'green ink',
  '#1982c4': 'blue ink',
  '#6a4c93': 'purple ink',
  '#f957a8': 'pink ink',
  '#ffffff': 'eraser'
};
const SUMMARY_COLOR_LABELS: Record<string, string> = {
  '#111111': 'black',
  '#ff595e': 'red',
  '#ffca3a': 'yellow',
  '#34d399': 'green',
  '#1982c4': 'blue',
  '#6a4c93': 'purple',
  '#f957a8': 'pink',
  '#ffffff': 'eraser'
};
const MAX_STROKES = 220;
const MAX_POINTS_PER_STROKE = 180;
const POINT_DISTANCE_THRESHOLD = 4;

export function createEmptyDrawing(): DrawingDoc {
  return {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    strokes: []
  };
}

export function estimateDrawingBytes(drawing: DrawingDoc): number {
  return new Blob([JSON.stringify(drawing)]).size;
}

export function renderDrawing(canvas: HTMLCanvasElement, drawing: DrawingDoc | null | undefined): void {
  const ctx = setupCanvas(canvas);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!drawing) {
    return;
  }

  for (const stroke of drawing.strokes) {
    drawStroke(ctx, stroke);
  }
}

export class DrawingPad {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly toolsSummary: HTMLElement;
  private readonly drawing: DrawingDoc = createEmptyDrawing();
  private color = COLORS[0];
  private size = SIZES[1];
  private currentStroke: Stroke | null = null;
  private activePointerId: number | null = null;
  private limitMessage = '';
  private readonly onChange: () => void;
  private readonly colorButtons = new Map<string, HTMLButtonElement>();
  private readonly sizeButtons = new Map<number, HTMLButtonElement>();
  private readonly undoButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;

  constructor(onChange: () => void, submitSlot?: HTMLElement) {
    this.onChange = onChange;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'draw-canvas';
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.canvas.setAttribute('aria-label', 'Drawing canvas');
    this.canvas.tabIndex = 0;
    this.status = document.createElement('div');
    this.status.className = 'draw-status';
    this.status.setAttribute('aria-live', 'polite');
    this.toolsSummary = document.createElement('summary');
    this.toolsSummary.className = 'tools-summary';
    this.toolsSummary.setAttribute('aria-label', 'Open drawing tools');

    const toolbar = document.createElement('div');
    toolbar.className = 'draw-toolbar';
    const colorTools = document.createElement('div');
    colorTools.className = 'draw-tools color-tools';
    colorTools.setAttribute('aria-label', 'Ink colors');
    const sizeTools = document.createElement('div');
    sizeTools.className = 'draw-tools size-tools';
    sizeTools.setAttribute('aria-label', 'Brush size');
    const actionTools = document.createElement('div');
    actionTools.className = 'draw-tools action-tools';
    actionTools.setAttribute('aria-label', 'Drawing actions');

    for (const color of COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.style.background = color;
      swatch.title = `Use ${COLOR_LABELS[color] ?? color}`;
      swatch.setAttribute('aria-label', swatch.title);
      swatch.addEventListener('click', () => {
        this.color = color;
        this.updateStatus();
      });
      this.colorButtons.set(color, swatch);
      colorTools.appendChild(swatch);
    }
    for (const size of SIZES) {
      const sizeButton = document.createElement('button');
      sizeButton.type = 'button';
      sizeButton.className = 'tool-button';
      sizeButton.textContent = `${size}px`;
      sizeButton.dataset.size = String(size);
      sizeButton.title = `Use ${size}px brush`;
      sizeButton.addEventListener('click', () => {
        this.size = size;
        this.updateStatus();
      });
      this.sizeButtons.set(size, sizeButton);
      sizeTools.appendChild(sizeButton);
    }

    this.undoButton = iconButton(Undo2, 'Undo last stroke', 'tool-button icon-button');
    this.undoButton.addEventListener('click', () => {
      this.drawing.strokes.pop();
      this.limitMessage = '';
      this.redraw();
      this.onChange();
      this.updateStatus();
    });
    actionTools.appendChild(this.undoButton);

    this.clearButton = iconButton(Trash2, 'Clear drawing', 'tool-button icon-button danger');
    this.clearButton.addEventListener('click', () => {
      if (!this.hasInk() || !window.confirm('Clear your drawing?')) {
        return;
      }
      this.drawing.strokes.length = 0;
      this.limitMessage = '';
      this.redraw();
      this.onChange();
      this.updateStatus();
    });
    actionTools.appendChild(this.clearButton);
    toolbar.append(colorTools, sizeTools, actionTools);

    const toolsDrawer = document.createElement('details');
    toolsDrawer.className = 'tools-drawer';
    if (window.matchMedia('(min-width: 700px)').matches) {
      toolsDrawer.open = true;
    }
    toolsDrawer.append(this.toolsSummary, toolbar);

    const canvasStage = document.createElement('div');
    canvasStage.className = 'canvas-stage';
    canvasStage.append(this.canvas, this.status);

    this.root = document.createElement('section');
    this.root.className = 'drawing-pad';
    this.root.append(canvasStage);
    if (submitSlot) {
      this.root.appendChild(submitSlot);
    }
    this.root.append(toolsDrawer);
    this.bindPointerEvents();
    this.redraw();
    this.updateStatus();
  }

  getDrawing(): DrawingDoc {
    return {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      strokes: this.drawing.strokes.slice(0, MAX_STROKES).map(normalizeStroke)
    };
  }

  hasInk(): boolean {
    return this.drawing.strokes.length > 0;
  }

  private bindPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.activePointerId !== null) {
        return;
      }
      if (this.drawing.strokes.length >= MAX_STROKES) {
        this.limitMessage = 'Drawing is full. Undo or clear to keep going.';
        this.updateStatus();
        return;
      }
      this.activePointerId = event.pointerId;
      safelySetPointerCapture(this.canvas, event.pointerId);
      const point = this.getPoint(event);
      this.currentStroke = {
        color: this.color,
        size: this.size,
        points: [point]
      };
      this.limitMessage = '';
      this.redraw();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.currentStroke || this.activePointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const point = this.getPoint(event);
      const previous = this.currentStroke.points.at(-1);
      if (!previous || Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y) >= POINT_DISTANCE_THRESHOLD) {
        if (this.currentStroke.points.length >= MAX_POINTS_PER_STROKE) {
          this.limitMessage = 'Stroke is full. Lift your finger to keep drawing.';
          this.updateStatus();
          return;
        }
        this.currentStroke.points.push(point);
        this.redraw();
      }
    });

    const finish = (event: PointerEvent) => {
      if (!this.currentStroke || this.activePointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      if (this.currentStroke.points.length === 1) {
        const point = this.currentStroke.points[0];
        this.currentStroke.points.push({
          ...point,
          x: point.x < CANVAS_WIDTH ? point.x + 1 : point.x - 1
        });
      }
      const normalizedStroke = normalizeStroke(this.currentStroke);
      if (normalizedStroke.points.length >= 2 && this.drawing.strokes.length < MAX_STROKES) {
        this.drawing.strokes.push(normalizedStroke);
      }
      this.limitMessage =
        this.drawing.strokes.length >= MAX_STROKES ? 'Drawing is full. Undo or clear to keep going.' : '';
      this.currentStroke = null;
      this.activePointerId = null;
      safelyReleasePointerCapture(this.canvas, event.pointerId);
      this.redraw();
      this.updateStatus();
      this.onChange();
    };

    this.canvas.addEventListener('pointerup', finish);
    this.canvas.addEventListener('pointercancel', finish);
  }

  private getPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT);
    return {
      x: clamp(x, 0, CANVAS_WIDTH),
      y: clamp(y, 0, CANVAS_HEIGHT)
    };
  }

  private redraw(): void {
    renderDrawing(this.canvas, {
      ...this.drawing,
      strokes: this.currentStroke ? [...this.drawing.strokes, this.currentStroke] : this.drawing.strokes
    });
  }

  private updateStatus(): void {
    const colorLabel = COLOR_LABELS[this.color] ?? this.color;
    const summaryColorLabel = SUMMARY_COLOR_LABELS[this.color] ?? colorLabel;
    this.toolsSummary.textContent = `Tools · ${summaryColorLabel} · ${this.size}px`;
    this.status.textContent =
      this.limitMessage ||
      `${this.drawing.strokes.length} ${this.drawing.strokes.length === 1 ? 'stroke' : 'strokes'}`;
    this.undoButton.disabled = !this.hasInk();
    this.clearButton.disabled = !this.hasInk();
    this.updateToolState();
  }

  private updateToolState(): void {
    for (const [color, button] of this.colorButtons) {
      const selected = color === this.color;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.title = `${selected ? 'Selected' : 'Use'} ${COLOR_LABELS[color] ?? color}`;
    }
    for (const [size, button] of this.sizeButtons) {
      const selected = size === this.size;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.title = `${selected ? 'Selected' : 'Use'} ${size}px brush`;
    }
  }
}

function iconButton(icon: IconNode, label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  const svg = createIconElement(icon, {
    class: 'button-icon',
    'aria-hidden': 'true',
    width: 22,
    height: 22
  });
  button.appendChild(svg);
  return button;
}

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  if (canvas.width !== CANVAS_WIDTH) {
    canvas.width = CANVAS_WIDTH;
  }
  if (canvas.height !== CANVAS_HEIGHT) {
    canvas.height = CANVAS_HEIGHT;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas rendering context is unavailable.');
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length < 2) {
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function normalizeStroke(stroke: Stroke): Stroke {
  return {
    color: stroke.color,
    size: stroke.size,
    points: simplifyStrokePoints(stroke.points, MAX_POINTS_PER_STROKE)
  };
}

function simplifyStrokePoints(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) {
    return points.map((point) => ({ ...point }));
  }
  if (maxPoints <= 1) {
    return points.length === 0 ? [] : [{ ...points[0] }];
  }

  const lastIndex = points.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    return { ...points[sourceIndex] };
  });
}

function safelySetPointerCapture(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {
    // Synthetic browser tests may dispatch pointer events without a captured pointer.
  }
}

function safelyReleasePointerCapture(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  } catch {
    // Releasing a pointer that the browser already cancelled is harmless.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const drawingTestExports = {
  COLORS,
  SIZES,
  COLOR_LABELS,
  MAX_STROKES,
  MAX_POINTS_PER_STROKE,
  simplifyStrokePoints,
  clamp
};
