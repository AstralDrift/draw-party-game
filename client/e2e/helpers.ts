import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export type PlayerViewport = {
  width: number;
  height: number;
  isMobile?: boolean;
};

export type SubmissionMessageType = 'submitDrawing' | 'submitGuess' | 'submitVote' | 'setName';

type SubmissionHarnessMode = 'defer' | 'drop';

export function makeAppUrl(baseURL: string | undefined): (path: string) => string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return (path: string) => new URL(path, baseURL).toString();
}

export function parseDeadlineLabel(label: string): number {
  const match = /^(\d+):(\d{2})$/.exec(label.trim());
  if (!match) {
    throw new Error(`Unexpected deadline label: ${label}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Controllable visualViewport for phone keyboard inset integration tests. */
export async function installControllableVisualViewport(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type ViewportListener = () => void;
    const resizeListeners = new Set<ViewportListener>();
    const scrollListeners = new Set<ViewportListener>();
    let visualHeight = window.innerHeight;
    let offsetTop = 0;

    const visual = {
      get height() {
        return visualHeight;
      },
      get offsetTop() {
        return offsetTop;
      },
      addEventListener(type: string, listener: ViewportListener) {
        if (type === 'resize') {
          resizeListeners.add(listener);
        }
        if (type === 'scroll') {
          scrollListeners.add(listener);
        }
      },
      removeEventListener(type: string, listener: ViewportListener) {
        if (type === 'resize') {
          resizeListeners.delete(listener);
        }
        if (type === 'scroll') {
          scrollListeners.delete(listener);
        }
      }
    };

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => visual
    });

    (
      window as Window & { __setVisualViewport: (height: number, top?: number) => void }
    ).__setVisualViewport = (height: number, top = 0) => {
      visualHeight = height;
      offsetTop = top;
      resizeListeners.forEach((listener) => listener());
      scrollListeners.forEach((listener) => listener());
      window.dispatchEvent(new Event('resize'));
    };
  });
}

export async function setVisualViewportHeight(
  page: Page,
  height: number,
  offsetTop = 0
): Promise<void> {
  await page.evaluate(
    ({ height, offsetTop }) => {
      (
        window as Window & { __setVisualViewport: (height: number, top?: number) => void }
      ).__setVisualViewport(height, offsetTop);
    },
    { height, offsetTop }
  );
}

export async function expectWithinViewportHeight(
  page: Page,
  selector: string,
  viewportHeight: number
): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`${selector} must have a layout box.`);
  }
  const bottom = box.y + box.height;
  expect(bottom).toBeLessThanOrEqual(viewportHeight + 2);
  expect(box.y).toBeGreaterThanOrEqual(-2);
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
    await expect(page.locator('.player-join-card .eyebrow')).toHaveText(roomCode);
    await expect(page.locator('.player-room-chip')).toHaveCount(0);
    await expect(page.locator('input.code-input')).toHaveCount(0);
    await page.getByPlaceholder('Your name').fill(name);
    await page.getByRole('button', { name: 'Join the Party' }).click();
    await expect(page.locator('.app-shell.player .brand')).toHaveText('Lobby');
    pages.push(page);
  }
  return pages;
}

export async function expectUniformVoteLetterHeights(page: Page): Promise<void> {
  const heights = await page.locator('button.vote-option').evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height))
  );
  expect(heights.length).toBeGreaterThan(1);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
}

export async function expectTvDrawingStage(page: Page): Promise<void> {
  await expect(page.locator('.display-grid-drawing')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.display-grid-drawing .big-count')).toBeVisible();
  await expect(page.getByText('Phones are drawing')).toHaveCount(0);
  await expect(page.getByText('Practice drawing')).toHaveCount(0);
  const waitingCopy = await page.locator('.display-grid-drawing .progress-panel p.muted').allTextContents();
  expect(waitingCopy.join(' ')).not.toMatch(/Waiting on/);
}

export async function expectTvGuessingStage(page: Page): Promise<void> {
  await expect(page.locator('.display-grid-guessing')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.display-grid-guessing .reveal-canvas')).toBeVisible();
  await expect(page.locator('.display-grid-guessing .eyebrow')).toHaveCount(0);
  await expect(page.getByText('What did they draw?')).toHaveCount(0);
}

export async function expectTvVotingStage(page: Page): Promise<void> {
  await expect(page.locator('.display-grid-voting')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.display-grid-voting .vote-answer').first()).toBeVisible();
  await expect(page.locator('.display-grid-voting h2')).toHaveCount(0);
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

export async function collectDrawingPrompts(players: Page[]): Promise<string[]> {
  const prompts: string[] = [];
  for (const player of players) {
    await expect(player.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
    prompts.push((await player.locator('#prompt-text').innerText()).trim());
  }
  return prompts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function voteForRealPrompt(voter: Page, prompt: string): Promise<void> {
  const option = voter.getByRole('button', {
    name: new RegExp(`Option [A-Z]: ${escapeRegExp(prompt)}`)
  });
  await expect(option).toBeEnabled();
  await option.click();
}

export async function waitForArtistIndex(players: Page[]): Promise<number> {
  let currentArtistIndex = -1;
  await expect
    .poll(async () => {
      const visibleStates = await Promise.all(
        players.map((page) =>
          page
            .locator('.guessing-turn .prompt.small')
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
  options: { continueAfter?: boolean; maxLengthAnswers?: boolean; advanceVia?: 'host' | 'tv' } = {}
): Promise<void> {
  const { continueAfter = true, maxLengthAnswers = false, advanceVia = 'tv' } = options;
  await expectTvGuessingStage(tv);
  const guessers = await waitForGuessers(players);
  for (const [index, guesser] of guessers.entries()) {
    const prefix = `${uniqueLabel}-${index}-`;
    const fake = maxLengthAnswers ? `${prefix}${'x'.repeat(Math.max(0, 60 - prefix.length))}` : `${prefix}fake`;
    await guesser.getByPlaceholder('Something that sounds legit…').fill(fake.slice(0, 60));
    await guesser.getByRole('button', { name: /Submit Fake Title|Try Again/ }).click();
  }

  await expectTvVotingStage(tv);
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
    timeout: 12_000
  });
  if (continueAfter) {
    if (advanceVia === 'host') {
      const host = players[0];
      await expect(host.locator('.result-phone-advance')).toBeVisible();
      await expect(host.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 12_000 });
      await host.getByRole('button', { name: 'Continue' }).click();
    } else {
      const tvContinue = tv.getByRole('button', {
        name: 'Continue from TV (fallback)',
        exact: true
      });
      await expect(tvContinue).toBeEnabled({ timeout: 12_000 });
      await tvContinue.click();
    }
  }
}

export async function completeDrawingRound(
  tv: Page,
  players: Page[],
  roundLabel: string,
  options: { hostContinueFirstReveal?: boolean } = {}
): Promise<void> {
  for (let reveal = 0; reveal < players.length; reveal += 1) {
    await completeCurrentReveal(tv, players, `${roundLabel}-${reveal}`, {
      advanceVia: options.hostContinueFirstReveal && reveal === 0 ? 'host' : 'tv'
    });
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
  const preset = rounds === '1' ? /Quick:/ : rounds === '2' ? /Standard:/ : null;
  if (!preset) {
    throw new Error(`hostSaveRounds supports 1 (Quick) or 2 (Standard) rounds, got ${rounds}`);
  }
  const button = host.getByRole('button', { name: preset });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
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
