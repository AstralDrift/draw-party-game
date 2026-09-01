import { expect, test, type BrowserContext } from '@playwright/test';
import {
  completeDrawingRound,
  createPlayers,
  drawStroke,
  expectTvDrawingStage,
  hostSaveRounds,
  makeAppUrl,
  startParty
} from './helpers';

test('four phones complete two rounds, reach the podium, and rematch in the same room', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    await tvContext.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      Object.defineProperty(window, '__drawPartyLatestSnapshot', { configurable: true, value: null, writable: true });
      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
          const socket = Reflect.construct(target, args) as WebSocket;
          socket.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') return;
            try {
              const message = JSON.parse(event.data) as { snapshot?: unknown };
              if (message.snapshot) {
                (window as typeof window & { __drawPartyLatestSnapshot: unknown }).__drawPartyLatestSnapshot =
                  message.snapshot;
              }
            } catch {
              // Ignore non-game frames.
            }
          });
          return socket;
        }
      });
    });
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const names = ['Ava', 'Bo', 'Cy', 'Dee'];
    const players = await createPlayers(browser, contexts, appUrl, roomCode, names);
    await hostSaveRounds(players[0], '2');
    await startParty(players[0]);

    const seenPrompts = new Set<string>();
    for (let round = 1; round <= 2; round += 1) {
      await expect(tv.getByText(`Round ${round} of 2`)).toBeVisible();
      for (const player of players) {
        await expect(player.locator('#prompt-text')).not.toContainText(/^Draw:/);
        await expect(player.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
        seenPrompts.add((await player.locator('#prompt-text').innerText()).trim());
        await drawStroke(player);
        await player.getByRole('button', { name: 'Submit Drawing' }).click();
      }
      await completeDrawingRound(tv, players, `round-${round}`, {
        hostContinueFirstReveal: round === 1
      });
    }

    await expect(tv.locator('.podium')).toBeVisible();
    await expect(players[0].getByRole('button', { name: 'Play Again' })).toBeVisible({ timeout: 5000 });
    for (const player of players.slice(1)) {
      await expect(player.locator('.encore-panel')).toHaveCount(0);
      await expect(player.getByText('Host decides')).toHaveCount(0);
      await expect(player.locator('.scores-panel')).toBeVisible();
    }

    await players[0].getByRole('button', { name: 'Play Again' }).click();
    await expectTvDrawingStage(tv);
    await expect(tv.getByText('Round 1 of 2')).toBeVisible();
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
    for (const player of players) {
      await expect(player).toHaveURL(new RegExp(`/join/${roomCode}$`));
      await expect(player.locator('#prompt-text')).not.toContainText(/^Draw:/);
      await expect(player.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
      const replayPrompt = (await player.locator('#prompt-text').innerText()).trim();
      expect(seenPrompts.has(replayPrompt)).toBe(false);
    }

    const replayState = await tv.evaluate(() =>
      (window as typeof window & {
        __drawPartyLatestSnapshot: { currentRound?: number; players?: Array<{ score?: number }> } | null;
      }).__drawPartyLatestSnapshot
    );
    expect(replayState?.currentRound).toBe(1);
    expect(replayState?.players?.every((player) => player.score === 0)).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
