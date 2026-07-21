import { useEffect, useState } from 'react';
import { nowMs } from '../time';

export const FINALE_CELEBRATION_FALLBACK_MS = 3_000;

export function serverTimedGateTargetMs(
  deadlineMs: number | null | undefined,
  snapshotServerNowMs: number,
  fallbackDelayMs: number
): number {
  return deadlineMs ?? snapshotServerNowMs + Math.max(0, fallbackDelayMs);
}

/**
 * Opens a phase action at a server-clock timestamp. The phase key prevents an open gate from
 * leaking into a new snapshot/turn; older servers without a deadline get one short local hold.
 */
export function useServerTimedGate(
  phaseKey: string,
  deadlineMs: number | null | undefined,
  snapshotServerNowMs: number | null | undefined,
  fallbackDelayMs = FINALE_CELEBRATION_FALLBACK_MS
): boolean {
  const targetMs =
    phaseKey && snapshotServerNowMs !== null && snapshotServerNowMs !== undefined
      ? serverTimedGateTargetMs(deadlineMs, snapshotServerNowMs, fallbackDelayMs)
      : null;
  const gateIdentity = targetMs === null ? '' : `${phaseKey}:${targetMs}`;
  const [openGateIdentity, setOpenGateIdentity] = useState('');

  useEffect(() => {
    if (!gateIdentity || targetMs === null) {
      setOpenGateIdentity('');
      return;
    }

    const remainingMs = targetMs - nowMs();
    if (remainingMs <= 0) {
      setOpenGateIdentity(gateIdentity);
      return;
    }

    setOpenGateIdentity('');
    const timer = window.setTimeout(() => setOpenGateIdentity(gateIdentity), remainingMs);
    return () => window.clearTimeout(timer);
  }, [gateIdentity, targetMs]);

  return Boolean(gateIdentity) && openGateIdentity === gateIdentity;
}
