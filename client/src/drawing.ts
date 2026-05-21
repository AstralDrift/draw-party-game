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
    this.status = document.createElement('div');
    this.status.className = 'draw-status';
    this.toolsSummary = document.createElement('summary');
    this.toolsSummary.className = 'tools-summary';

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
      this.redraw();
      this.onChange();
      this.updateStatus();
    });
    actionTools.appendChild(this.clearButton);
    toolbar.append(colorTools, sizeTools, actionTools);

    const toolsDrawer = document.createElement('details');
    toolsDrawer.className = 'tools-drawer';
    toolsDrawer.append(this.toolsSummary, toolbar);

    this.root = document.createElement('section');
    this.root.className = 'drawing-pad';
    this.root.append(this.canvas);
    if (submitSlot) {
      this.root.appendChild(submitSlot);
    }
    this.root.append(toolsDrawer, this.status);
    this.bindPointerEvents();
    this.redraw();
    this.updateStatus();
  }

  getDrawing(): DrawingDoc {
    return {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      strokes: this.drawing.strokes.map((stroke) => ({
        color: stroke.color,
        size: stroke.size,
        points: stroke.points.map((point) => ({ ...point }))
      }))
    };
  }

  hasInk(): boolean {
    return this.drawing.strokes.length > 0;
  }

  private bindPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.getPoint(event);
      this.currentStroke = {
        color: this.color,
        size: this.size,
        points: [point]
      };
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.currentStroke) {
        return;
      }
      const point = this.getPoint(event);
      const previous = this.currentStroke.points.at(-1);
      if (!previous || Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y) >= 3) {
        this.currentStroke.points.push(point);
        this.redraw();
        drawStroke(setupCanvas(this.canvas), this.currentStroke);
      }
    });

    const finish = (event: PointerEvent) => {
      if (!this.currentStroke) {
        return;
      }
      if (this.currentStroke.points.length === 1) {
        this.currentStroke.points.push({ ...this.currentStroke.points[0], x: this.currentStroke.points[0].x + 1 });
      }
      this.drawing.strokes.push(this.currentStroke);
      this.currentStroke = null;
      this.canvas.releasePointerCapture(event.pointerId);
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
    renderDrawing(this.canvas, this.drawing);
  }

  private updateStatus(): void {
    const colorLabel = COLOR_LABELS[this.color] ?? this.color;
    this.toolsSummary.textContent = `Tools · ${colorLabel} · ${this.size}px`;
    this.status.textContent = `${this.drawing.strokes.length} ${this.drawing.strokes.length === 1 ? 'stroke' : 'strokes'}`;
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
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const drawingTestExports = {
  COLORS,
  SIZES,
  COLOR_LABELS,
  clamp
};
