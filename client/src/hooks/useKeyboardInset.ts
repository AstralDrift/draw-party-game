import { useEffect } from 'react';

interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

/** Layout height minus the visible visual viewport — the on-screen keyboard on phones. */
export function keyboardInsetPx(
  layoutHeight: number,
  visual: VisualViewportBox | null
): number {
  if (!visual) {
    return 0;
  }
  return Math.max(0, Math.round(layoutHeight - visual.height - visual.offsetTop));
}

export function useKeyboardInset(active: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.style.setProperty('--keyboard-inset', '0px');
      return;
    }

    const sync = () => {
      const visual = window.visualViewport;
      const inset = keyboardInsetPx(
        window.innerHeight,
        visual ? { height: visual.height, offsetTop: visual.offsetTop } : null
      );
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };

    sync();
    const visual = window.visualViewport;
    visual?.addEventListener('resize', sync);
    visual?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      visual?.removeEventListener('resize', sync);
      visual?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      root.style.setProperty('--keyboard-inset', '0px');
    };
  }, [active]);
}
