import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export type PlayerViewport = {
  width: number;
  height: number;
  isMobile?: boolean;
};

export type SubmissionMessageType = 'submitDrawing' | 'submitGuess' | 'submitVote';

type SubmissionHarnessMode = 'defer' | 'drop';

export function makeAppUrl(baseURL: string | undefined): (path: string) => string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return (path: string) => new URL(path, baseURL).toString();
}

export async function createPlayers(
  browser: Browser,
  contexts: BrowserContext[],
  appUrl: (path: string) => string,
  roomCode: string,
  names: string[],
  viewports: PlayerViewport[] = names.map(() => ({ width: 390, height: 844, isMobile: true })),
  prepareContext?: (context: BrowserContext, index: number) => Promise<void>
): Promise<Page[]> {
  const pages: Page[] = [];
  for (const [index, name] of names.entries()) {
    const viewport = viewports[index] ?? viewports[0];
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: viewport.isMobile ?? viewport.width < 700,
      viewport: { width: viewport.width, height: viewport.height }
    });
    contexts.push(context);
    await prepareContext?.(context, index);

    const page = await context.newPage();
    await page.goto(appUrl(`/join/${roomCode}`));
    await expect(page.locator('.player-room-chip')).toContainText(roomCode);
    await expect(page.locator('input.code-input')).toHaveCount(0);
    await page.getByPlaceholder('Your name').fill(name);
    await page.getByRole('button', { name: 'Join the Party' }).click();
    await expect(page.locator('.app-shell.player .brand')).toHaveText('Lobby');
    pages.push(page);
  }
  return pages;
}

export async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return Boolean(box && box.width >= 100 && box.height >= 75);
    })
    .toBe(true);

  // hasTouch mobile contexts flake on CDP mouse→pointer synthesis; drive the pad
  // with the same PointerEvent path production touch/pen input uses.
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const fire = (type: string, xRatio: number, yRatio: number, buttons = 1) => {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'pen',
          isPrimary: true,
          buttons,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        })
      );
    };
    fire('pointerdown', 0.2, 0.25);
    fire('pointermove', 0.33, 0.36);
    fire('pointermove', 0.46, 0.48);
    fire('pointermove', 0.59, 0.38);
    fire('pointermove', 0.72, 0.28);
    fire('pointerup', 0.72, 0.28, 0);
  });
}

/** Draw an asymmetric visual landmark whose orientation can be sampled after TV reveal. */
export async function drawTopLeftLandmark(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const fire = (type: string, xRatio: number, yRatio: number, buttons = 1) => {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 41,
          pointerType: 'pen',
          isPrimary: true,
          buttons,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        })
      );
    };
    fire('pointerdown', 0.14, 0.1);
    fire('pointermove', 0.14, 0.3);
    fire('pointermove', 0.31, 0.3);
    fire('pointerup', 0.31, 0.3, 0);
  });
  await expect(page.locator('.draw-status')).toHaveText('1 stroke');
}

export async function canvasHasInkNear(
  page: Page,
  selector: string,
  xRatio: number,
  yRatio: number,
  radius = 10
): Promise<boolean> {
  return page.locator(selector).evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const centerX = Math.round(canvas.width * point.xRatio);
      const centerY = Math.round(canvas.height * point.yRatio);
      for (let offsetY = -point.radius; offsetY <= point.radius; offsetY += 1) {
        for (let offsetX = -point.radius; offsetX <= point.radius; offsetX += 1) {
          const x = Math.min(canvas.width - 1, Math.max(0, centerX + offsetX));
          const y = Math.min(canvas.height - 1, Math.max(0, centerY + offsetY));
          const [red, green, blue] = Array.from(ctx.getImageData(x, y, 1, 1).data);
          if (red < 240 || green < 240 || blue < 240) return true;
        }
      }
      return false;
    },
    { xRatio, yRatio, radius }
  );
}

export async function waitForPagesWithVisibleLocatorCount(
  pages: Page[],
  selector: string,
  count: number
): Promise<Page[]> {
  await expect
    .poll(async () => {
      let visible = 0;
      for (const page of pages) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          visible += 1;
        }
      }
      return visible;
    })
    .toBe(count);

  const found: Page[] = [];
  for (const page of pages) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      found.push(page);
    }
  }
  return found;
}

export async function waitForGuessers(players: Page[]): Promise<Page[]> {
  return waitForPagesWithVisibleLocatorCount(
    players,
    'input[placeholder="Something that sounds legit…"]',
    Math.max(0, players.length - 1)
  );
}

export async function waitForArtistIndex(players: Page[]): Promise<number> {
  let currentArtistIndex = -1;
  await expect
    .poll(async () => {
      const visibleStates = await Promise.all(
        players.map((page) =>
          page
            .getByText(/You.?re the artist/i)
            .first()
            .isVisible()
            .catch(() => false)
        )
      );
      const visibleIndices = visibleStates
        .map((visible, index) => (visible ? index : -1))
        .filter((index) => index >= 0);
      currentArtistIndex = visibleIndices.length === 1 ? visibleIndices[0] : -1;
      return currentArtistIndex;
    })
    .toBeGreaterThanOrEqual(0);
  return currentArtistIndex;
}

export async function completeCurrentReveal(
  tv: Page,
  players: Page[],
  uniqueLabel: string,
  options: { continueAfter?: boolean; maxLengthAnswers?: boolean } = {}
): Promise<void> {
  const { continueAfter = true, maxLengthAnswers = false } = options;
  await expect(tv.getByText('What did they draw?')).toBeVisible();
  const guessers = await waitForGuessers(players);
  for (const [index, guesser] of guessers.entries()) {
    const prefix = `${uniqueLabel}-${index}-`;
    const fake = maxLengthAnswers ? `${prefix}${'x'.repeat(Math.max(0, 60 - prefix.length))}` : `${prefix}fake`;
    await guesser.getByPlaceholder('Something that sounds legit…').fill(fake.slice(0, 60));
    await guesser.getByRole('button', { name: /Submit Fake Title|Try Again/ }).click();
  }

  await expect(tv.getByText('Which title is real?')).toBeVisible();
  const voters = await waitForPagesWithVisibleLocatorCount(
    players,
    'button.vote-option:not([disabled])',
    Math.max(0, players.length - 1)
  );
  for (const voter of voters) {
    await voter.locator('button.vote-option:not([disabled])').first().click();
  }

  await expect(tv.locator('.results-panel.display-results')).toBeVisible();
  await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
    timeout: 10_000
  });
  if (continueAfter) {
    await expect(tv.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 10_000 });
    await tv.getByRole('button', { name: 'Continue' }).click();
  }
}

export async function completeDrawingRound(tv: Page, players: Page[], roundLabel: string): Promise<void> {
  for (let reveal = 0; reveal < players.length; reveal += 1) {
    await completeCurrentReveal(tv, players, `${roundLabel}-${reveal}`);
  }
}

export async function startParty(host: Page): Promise<void> {
  await expect(host.getByRole('button', { name: 'Start Party' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start Party' }).click();
}

export async function startPractice(host: Page): Promise<void> {
  await expect(host.getByRole('button', { name: 'Practice Drawing' })).toBeEnabled();
  await host.getByRole('button', { name: 'Practice Drawing' }).click();
}

/** Host phone owns writable lobby settings (TV is read-only). */
export async function hostSaveRounds(host: Page, rounds: string): Promise<void> {
  await expect(host.locator('.settings-panel')).toBeVisible();
  const advanced = host.locator('.settings-advanced');
  if ((await advanced.count()) > 0) {
    const isOpen = await advanced.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!isOpen) await advanced.locator('summary').click();
  }
  await host.getByLabel('Rounds').fill(rounds);
  await host.getByRole('button', { name: 'Apply custom settings' }).click();
  await expect(host.getByLabel('Rounds')).toHaveValue(rounds);
}

export async function installSubmissionHarness(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeSend = WebSocket.prototype.send;
    type PendingFrame = { socket: WebSocket; data: string | ArrayBufferLike | Blob | ArrayBufferView };
    const harness = {
      next: null as { type: string; mode: SubmissionHarnessMode } | null,
      pending: [] as PendingFrame[],
      counts: {} as Record<string, number>,
      configure(type: string, mode: SubmissionHarnessMode) {
        this.next = { type, mode };
      },
      release() {
        const frame = this.pending.shift();
        if (frame) nativeSend.call(frame.socket, frame.data);
      }
    };
    Object.defineProperty(window, '__drawPartySubmissionHarness', {
      configurable: false,
      value: harness
    });
    WebSocket.prototype.send = function send(data) {
      let type = '';
      if (typeof data === 'string') {
        try {
          type = (JSON.parse(data) as { type?: string }).type ?? '';
        } catch {
          // Non-JSON traffic is passed through unchanged.
        }
      }
      if (type) harness.counts[type] = (harness.counts[type] ?? 0) + 1;
      if (harness.next?.type === type) {
        const mode = harness.next.mode;
        harness.next = null;
        if (mode === 'defer') {
          harness.pending.push({ socket: this, data });
          return;
        }
        this.close();
        return;
      }
      nativeSend.call(this, data);
    };
  });
}

export async function configureSubmissionHarness(
  page: Page,
  type: SubmissionMessageType,
  mode: SubmissionHarnessMode
): Promise<void> {
  await page.evaluate(
    ({ messageType, nextMode }) => {
      const harness = (
        window as typeof window & {
          __drawPartySubmissionHarness: { configure: (type: string, mode: SubmissionHarnessMode) => void };
        }
      ).__drawPartySubmissionHarness;
      harness.configure(messageType, nextMode);
    },
    { messageType: type, nextMode: mode }
  );
}

export async function releaseDeferredSubmission(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as typeof window & { __drawPartySubmissionHarness: { release: () => void } }
    ).__drawPartySubmissionHarness.release();
  });
}

export async function submissionSendCount(page: Page, type: SubmissionMessageType): Promise<number> {
  return page.evaluate((messageType) => {
    const harness = (
      window as typeof window & { __drawPartySubmissionHarness: { counts: Record<string, number> } }
    ).__drawPartySubmissionHarness;
    return harness.counts[messageType] ?? 0;
  }, type);
}

export async function assertAllWithinViewport(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    await expect(locator, `${selector} must exist`).not.toHaveCount(0);
    const issues = await locator.evaluateAll((elements, currentSelector) => {
      const tolerance = 2;
      const failures: string[] = [];
      for (const [index, element] of elements.entries()) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          failures.push(`${currentSelector}[${index}] has no visible box`);
          continue;
        }
        if (
          rect.left < -tolerance ||
          rect.top < -tolerance ||
          rect.right > window.innerWidth + tolerance ||
          rect.bottom > window.innerHeight + tolerance
        ) {
          failures.push(`${currentSelector}[${index}] leaves viewport: ${JSON.stringify(rect.toJSON())}`);
        }
        let ancestor = element.parentElement;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
            (rect.left < ancestorRect.left - tolerance || rect.right > ancestorRect.right + tolerance)
          ) {
            failures.push(`${currentSelector}[${index}] is horizontally clipped by .${ancestor.className}`);
            break;
          }
          if (
            (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
            (rect.top < ancestorRect.top - tolerance || rect.bottom > ancestorRect.bottom + tolerance)
          ) {
            failures.push(`${currentSelector}[${index}] is vertically clipped by .${ancestor.className}`);
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }
      return failures;
    }, selector);
    expect(issues, issues.join('\n')).toEqual([]);
  }
}

export async function assertNoOverlaps(page: Page, selector: string, soft = false): Promise<void> {
  const overlaps = await page.locator(selector).evaluateAll((elements) => {
    const boxes = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        slot: element.getAttribute('data-slot'),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    });
    const failures: string[] = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) {
          failures.push(`${JSON.stringify(boxes[left])} overlaps ${JSON.stringify(boxes[right])}`);
        }
      }
    }
    return failures;
  });
  const matcher = soft ? expect.soft(overlaps, overlaps.join('\n')) : expect(overlaps, overlaps.join('\n'));
  matcher.toEqual([]);
}
