import { Eraser, Trash2, Undo2, createElement as createIconElement, type IconNode } from 'lucide';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type DrawingDoc, type Point, type Stroke } from './protocol';

const COLORS = ['#111111', '#ff595e', '#ffca3a', '#34d399', '#1982c4', '#6a4c93', '#f957a8', '#ffffff'];
const SIZES = [3, 6, 10, 16];
const ERASER_COLOR = '#ffffff';
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
const CLEAR_ARM_MS = 3000;
const PORTRAIT_DRAWING_QUERY = '(max-width: 699px) and (orientation: portrait)';
const PORTRAIT_FRAME_SCALE = CANVAS_HEIGHT / CANVAS_WIDTH;
const PORTRAIT_FRAME_WIDTH = CANVAS_HEIGHT * PORTRAIT_FRAME_SCALE;
const PORTRAIT_FRAME_LEFT = (CANVAS_WIDTH - PORTRAIT_FRAME_WIDTH) / 2;
const PORTRAIT_FRAME_RIGHT = PORTRAIT_FRAME_LEFT + PORTRAIT_FRAME_WIDTH;
const PORTRAIT_PREVIEW_SCALE = 1 / PORTRAIT_FRAME_SCALE;

interface RenderDrawingOptions {
  portraitPreview?: boolean;
}

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

export function renderDrawing(
  canvas: HTMLCanvasElement,
  drawing: DrawingDoc | null | undefined,
  options: RenderDrawingOptions = {}
): void {
  const ctx = setupCanvas(canvas);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!drawing) {
    return;
  }

  ctx.save();
  if (options.portraitPreview) {
    // Portrait input is stored upright in a centered 3:4 frame in the canonical
    // landscape document. This inverse transform feeds that document through the
    // existing clockwise CSS rotation so live ink remains under the pointer.
    ctx.transform(
      0,
      -PORTRAIT_PREVIEW_SCALE,
      PORTRAIT_PREVIEW_SCALE,
      0,
      0,
      PORTRAIT_FRAME_RIGHT * PORTRAIT_PREVIEW_SCALE
    );
  }
  for (const stroke of drawing.strokes) {
    drawStroke(ctx, stroke);
  }
  ctx.restore();
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
  private readonly portraitDrawingMedia: MediaQueryList;
  private locked = false;
  private clearArmed = false;
  private clearArmTimer: number | null = null;
  private readonly handlePortraitDrawingChange = (): void => {
    this.redraw();
  };

  constructor(onChange: () => void, submitSlot?: HTMLElement) {
    this.onChange = onChange;
    this.portraitDrawingMedia = window.matchMedia(PORTRAIT_DRAWING_QUERY);
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
      swatch.className = color === ERASER_COLOR ? 'swatch swatch-eraser' : 'swatch';
      swatch.style.background = color;
      swatch.title = `Use ${COLOR_LABELS[color] ?? color}`;
      swatch.setAttribute('aria-label', swatch.title);
      if (color === ERASER_COLOR) {
        const eraserIcon = createIconElement(Eraser, {
          class: 'swatch-eraser-icon',
          'aria-hidden': 'true',
          width: 18,
          height: 18
        });
        swatch.appendChild(eraserIcon);
      }
      swatch.addEventListener('click', () => {
        if (this.locked) {
          return;
        }
        this.color = color;
        this.disarmClear();
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
        if (this.locked) {
          return;
        }
        this.size = size;
        this.disarmClear();
        this.updateStatus();
      });
      this.sizeButtons.set(size, sizeButton);
      sizeTools.appendChild(sizeButton);
    }

    this.undoButton = iconButton(Undo2, 'Undo last stroke', 'tool-button icon-button');
    this.undoButton.addEventListener('click', () => {
      if (this.locked) {
        return;
      }
      this.disarmClear();
      this.drawing.strokes.pop();
      this.limitMessage = '';
      this.redraw();
      this.onChange();
      this.updateStatus();
    });
    actionTools.appendChild(this.undoButton);

    this.clearButton = iconButton(Trash2, 'Clear drawing', 'tool-button icon-button danger');
    this.clearButton.addEventListener('click', () => {
      if (this.locked) {
        return;
      }
      if (!this.hasInk()) {
        return;
      }
      if (!this.clearArmed) {
        this.armClear();
        return;
      }
      this.disarmClear();
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
    this.portraitDrawingMedia.addEventListener('change', this.handlePortraitDrawingChange);
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

  setLocked(locked: boolean): void {
    const changed = this.locked !== locked;
    this.locked = locked;

    if (locked && changed) {
      this.disarmClear();
      const activePointerId = this.activePointerId;
      this.currentStroke = null;
      this.activePointerId = null;
      if (activePointerId !== null) {
        safelyReleasePointerCapture(this.canvas, activePointerId);
      }
      this.redraw();
    }

    this.root.classList.toggle('is-locked', locked);
    this.root.setAttribute('aria-disabled', String(locked));
    if (locked) {
      this.root.setAttribute('aria-busy', 'true');
    } else {
      this.root.removeAttribute('aria-busy');
    }
    this.canvas.setAttribute('aria-disabled', String(locked));
    this.canvas.tabIndex = locked ? -1 : 0;
    this.toolsSummary.setAttribute('aria-disabled', String(locked));
    this.updateStatus();
  }

  destroy(): void {
    this.portraitDrawingMedia.removeEventListener('change', this.handlePortraitDrawingChange);
    if (this.clearArmTimer !== null) {
      window.clearTimeout(this.clearArmTimer);
      this.clearArmTimer = null;
    }
  }

  private bindPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.locked || this.activePointerId !== null) {
        return;
      }
      if (this.drawing.strokes.length >= MAX_STROKES) {
        this.limitMessage = 'Drawing is full. Undo or clear to keep going.';
        this.updateStatus();
        return;
      }
      this.disarmClear();
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
      if (this.locked || !this.currentStroke || this.activePointerId !== event.pointerId) {
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
      if (this.locked || !this.currentStroke || this.activePointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const normalizedStroke = normalizeStroke(completeTapStroke(this.currentStroke));
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
    return mapPointerToDrawingPoint(event.clientX, event.clientY, rect, this.portraitDrawingMedia.matches);
  }

  private redraw(): void {
    renderDrawing(
      this.canvas,
      {
        ...this.drawing,
        strokes: this.currentStroke ? [...this.drawing.strokes, this.currentStroke] : this.drawing.strokes
      },
      { portraitPreview: this.portraitDrawingMedia.matches }
    );
  }

  private updateStatus(): void {
    const colorLabel = COLOR_LABELS[this.color] ?? this.color;
    const summaryColorLabel = SUMMARY_COLOR_LABELS[this.color] ?? colorLabel;
    this.toolsSummary.textContent = `Tools · ${summaryColorLabel} · ${this.size}px`;
    this.status.textContent = this.locked
      ? 'Drawing locked while sending.'
      : this.limitMessage ||
        `${this.drawing.strokes.length} ${this.drawing.strokes.length === 1 ? 'stroke' : 'strokes'}`;
    this.undoButton.disabled = this.locked || !this.hasInk();
    this.clearButton.disabled = this.locked || !this.hasInk();
    if (!this.hasInk() && this.clearArmed) {
      this.disarmClear();
    }
    this.updateToolState();
  }

  private armClear(): void {
    this.clearArmed = true;
    this.clearButton.classList.add('is-armed');
    this.clearButton.title = 'Tap again to clear drawing';
    this.clearButton.setAttribute('aria-label', 'Tap again to clear drawing');
    this.limitMessage = 'Tap clear again to erase everything.';
    if (this.clearArmTimer !== null) {
      window.clearTimeout(this.clearArmTimer);
    }
    this.clearArmTimer = window.setTimeout(() => {
      this.disarmClear();
      this.updateStatus();
    }, CLEAR_ARM_MS);
    this.updateStatus();
  }

  private disarmClear(): void {
    if (!this.clearArmed && this.clearArmTimer === null) {
      return;
    }
    this.clearArmed = false;
    this.clearButton.classList.remove('is-armed');
    this.clearButton.title = 'Clear drawing';
    this.clearButton.setAttribute('aria-label', 'Clear drawing');
    if (this.clearArmTimer !== null) {
      window.clearTimeout(this.clearArmTimer);
      this.clearArmTimer = null;
    }
    if (this.limitMessage === 'Tap clear again to erase everything.') {
      this.limitMessage = '';
    }
  }

  private updateToolState(): void {
    for (const [color, button] of this.colorButtons) {
      const selected = color === this.color;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.title = `${selected ? 'Selected' : 'Use'} ${COLOR_LABELS[color] ?? color}`;
      button.disabled = this.locked;
    }
    for (const [size, button] of this.sizeButtons) {
      const selected = size === this.size;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.title = `${selected ? 'Selected' : 'Use'} ${size}px brush`;
      button.disabled = this.locked;
    }
  }
}

function mapPointerToDrawingPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'width' | 'height'>,
  portraitDrawing: boolean
): Point {
  const x = portraitDrawing
    ? Math.round(PORTRAIT_FRAME_LEFT + ((clientX - rect.left) / rect.width) * PORTRAIT_FRAME_WIDTH)
    : Math.round(((clientX - rect.left) / rect.width) * CANVAS_WIDTH);
  const y = Math.round(((clientY - rect.top) / rect.height) * CANVAS_HEIGHT);
  return {
    x: clamp(x, 0, CANVAS_WIDTH),
    y: clamp(y, 0, CANVAS_HEIGHT)
  };
}

function mapDrawingPointToPortraitPreview(point: Point): Point {
  return {
    x: point.y * PORTRAIT_PREVIEW_SCALE,
    y: (PORTRAIT_FRAME_RIGHT - point.x) * PORTRAIT_PREVIEW_SCALE
  };
}

function completeTapStroke(stroke: Stroke): Stroke {
  if (stroke.points.length !== 1) {
    return stroke;
  }
  const point = stroke.points[0];
  return {
    ...stroke,
    points: [{ ...point }, { ...point }]
  };
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
  if (stroke.points.length === 0) {
    return;
  }
  if (isDotStroke(stroke)) {
    const point = stroke.points[0];
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
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

function isDotStroke(stroke: Stroke): boolean {
  const first = stroke.points[0];
  return Boolean(first && stroke.points.every((point) => point.x === first.x && point.y === first.y));
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
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export const drawingTestExports = {
  COLORS,
  SIZES,
  COLOR_LABELS,
  MAX_STROKES,
  MAX_POINTS_PER_STROKE,
  PORTRAIT_FRAME_LEFT,
  PORTRAIT_FRAME_RIGHT,
  PORTRAIT_FRAME_WIDTH,
  simplifyStrokePoints,
  clamp,
  mapPointerToDrawingPoint,
  mapDrawingPointToPortraitPreview,
  completeTapStroke,
  isDotStroke
};
