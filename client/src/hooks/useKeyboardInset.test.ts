/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { keyboardInsetPx, useKeyboardInset } from './useKeyboardInset';

function InsetProbe({ active }: { active: boolean }): React.JSX.Element {
  useKeyboardInset(active);
  return createElement('output');
}

afterEach(() => {
  document.documentElement.style.removeProperty('--keyboard-inset');
  document.body.replaceChildren();
});

describe('keyboardInsetPx', () => {
  it('is zero when the visual viewport fills the layout', () => {
    expect(keyboardInsetPx(667, { height: 667, offsetTop: 0 })).toBe(0);
  });

  it('is the keyboard overlap when the visual viewport shrinks', () => {
    expect(keyboardInsetPx(667, { height: 400, offsetTop: 0 })).toBe(267);
  });

  it('subtracts a scrolled visual viewport so padding is not doubled', () => {
    expect(keyboardInsetPx(667, { height: 400, offsetTop: 50 })).toBe(217);
  });

  it('is zero without a visual viewport', () => {
    expect(keyboardInsetPx(667, null)).toBe(0);
  });
});

describe('useKeyboardInset', () => {
  it('writes the inset onto the document and clears it when inactive', () => {
    const listeners = new Map<string, Set<() => void>>();
    const visual = {
      height: 400,
      offsetTop: 0,
      addEventListener(type: string, listener: () => void) {
        const bucket = listeners.get(type) ?? new Set<() => void>();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      }
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 667 });

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(createElement(InsetProbe, { active: true }));
    });
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('267px');

    visual.height = 667;
    act(() => {
      listeners.get('resize')?.forEach((listener) => listener());
    });
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');

    act(() => {
      root.render(createElement(InsetProbe, { active: false }));
    });
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    act(() => root.unmount());
  });
});
