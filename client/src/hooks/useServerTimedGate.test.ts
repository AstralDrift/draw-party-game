/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerClock } from '../time';
import {
  FINALE_CELEBRATION_FALLBACK_MS,
  serverTimedGateTargetMs,
  useServerTimedGate
} from './useServerTimedGate';

function GateProbe({
  phaseKey,
  deadlineMs,
  serverNowMs
}: {
  phaseKey: string;
  deadlineMs: number | null;
  serverNowMs: number;
}): React.JSX.Element {
  const ready = useServerTimedGate(phaseKey, deadlineMs, serverNowMs);
  return createElement('output', { 'data-ready': ready }, String(ready));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  resetServerClock();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('serverTimedGateTargetMs', () => {
  it('uses the authoritative phase deadline when the server supplies one', () => {
    expect(serverTimedGateTargetMs(8_000, 5_000, FINALE_CELEBRATION_FALLBACK_MS)).toBe(8_000);
  });

  it('falls back to a short snapshot-anchored hold for legacy final-score snapshots', () => {
    expect(serverTimedGateTargetMs(null, 5_000, FINALE_CELEBRATION_FALLBACK_MS)).toBe(8_000);
  });

  it('opens at the deadline and closes again for a new phase-keyed snapshot', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() =>
      root.render(
        createElement(GateProbe, {
          phaseKey: 'ROOM:final:7',
          deadlineMs: 4_000,
          serverNowMs: 1_000
        })
      )
    );
    expect(container.querySelector('output')?.dataset.ready).toBe('false');

    act(() => vi.advanceTimersByTime(2_999));
    expect(container.querySelector('output')?.dataset.ready).toBe('false');

    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('output')?.dataset.ready).toBe('true');

    act(() =>
      root.render(
        createElement(GateProbe, {
          phaseKey: 'ROOM:final:8',
          deadlineMs: 7_000,
          serverNowMs: 4_000
        })
      )
    );
    expect(container.querySelector('output')?.dataset.ready).toBe('false');

    act(() => root.unmount());
  });
});
