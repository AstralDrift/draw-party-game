import { expect, test, type BrowserContext } from '@playwright/test';
import { createPlayers, drawStroke, hostSaveRounds, makeAppUrl, waitForGuessers } from './helpers';

test('display refresh reattaches to the active game', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();

    await tv.reload();

    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a stale cached display room recovers into one fresh lobby', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  try {
    await context.addInitScript(() => {
      localStorage.setItem('draw-party-active-host-room', 'ZZZZ');
      localStorage.setItem('draw-party-host-token-ZZZZ', 'stale-token');
      const NativeWebSocket = window.WebSocket;
      let delayFirstClose = true;
      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
          const socket = Reflect.construct(target, args) as WebSocket;
          if (delayFirstClose) {
            delayFirstClose = false;
            const close = socket.close.bind(socket);
            socket.close = ((code?: number, reason?: string) => {
              window.setTimeout(() => close(code, reason), 1000);
            }) as typeof socket.close;
          }
          return socket;
        }
      });
    });
    const tv = await context.newPage();
    await tv.goto(appUrl('/'));

    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/, { timeout: 10000 });
    await expect(tv.locator('.room-code')).not.toHaveText('ZZZZ');
    await expect(tv.getByText('Creating a fresh lobby…')).toHaveCount(0);
    await tv.waitForTimeout(1500);
    await expect(tv.locator('#connection-text')).toHaveText('Connected');
  } finally {
    await context.close();
  }
});

test('player refresh reclaims the same drawing seat automatically', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();

    await players[0].reload();

    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
    await expect(players[0].getByRole('button', { name: 'Join the Party' })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('manual join canonicalizes the room and survives refresh', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const playerContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(playerContext);
    const player = await playerContext.newPage();
    await player.goto(appUrl('/join'));
    await player.locator('input.code-input').fill(roomCode);
    await player.getByPlaceholder('Your name').fill('Manual Mia');
    await player.getByRole('button', { name: 'Join the Party' }).click();

    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(player).toHaveURL(new RegExp(`/join/${roomCode}$`));

    await player.reload();

    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(player.getByText('Playing as Manual Mia')).toBeVisible();

    const duplicatePromise = playerContext.waitForEvent('page');
    await player.evaluate(() => window.open(window.location.href, '_blank'));
    const duplicate = await duplicatePromise;
    await duplicate.waitForLoadState('domcontentloaded');
    await expect(duplicate.getByRole('button', { name: 'Join the Party' })).toBeVisible();
    await expect(duplicate.getByText('Almost in')).toHaveCount(0);
    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a remembered name does not autojoin an unconfirmed QR room', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  });

  try {
    await context.addInitScript(() => localStorage.setItem('draw-party-name', 'Remembered Rae'));
    const player = await context.newPage();
    await player.goto(appUrl('/join/ABCD'));

    await expect(player.getByRole('button', { name: 'Join the Party' })).toBeVisible();
    await expect(player.getByPlaceholder('Your name')).toHaveValue('Remembered Rae');
    await expect(player.getByText('Almost in')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a drawing interrupted by reconnect stays retryable', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava', 'Bo'],
      undefined,
      async (context, index) => {
        if (index !== 0) return;
        await context.addInitScript(() => {
          const nativeSend = WebSocket.prototype.send;
          Object.defineProperty(window, '__drawPartyFailNextDrawing', {
            configurable: true,
            value: false,
            writable: true
          });
          WebSocket.prototype.send = function send(data) {
            const testWindow = window as typeof window & { __drawPartyFailNextDrawing: boolean };
            if (
              testWindow.__drawPartyFailNextDrawing &&
              typeof data === 'string' &&
              JSON.parse(data).type === 'submitDrawing'
            ) {
              testWindow.__drawPartyFailNextDrawing = false;
              this.close();
              throw new DOMException('simulated connection loss');
            }
            nativeSend.call(this, data);
          };
        });
      }
    );
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await drawStroke(players[0]);
    const drawingHostBeforeRetry = await players[0].locator('.drawing-pad-host').boundingBox();
    if (!drawingHostBeforeRetry) throw new Error('drawing host must have a layout box');

    await players[0].evaluate(() => {
      (
        window as typeof window & { __drawPartyFailNextDrawing: boolean }
      ).__drawPartyFailNextDrawing = true;
    });
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();

    await expect
      .poll(() =>
        players[0].evaluate(
          () =>
            (window as typeof window & { __drawPartyFailNextDrawing: boolean })
              .__drawPartyFailNextDrawing
        )
      )
      .toBe(false);
    await expect(players[0].getByRole('alert')).toHaveText(/Connection lost.*reconnecting/i);
    const drawingHostDuringRetry = await players[0].locator('.drawing-pad-host').boundingBox();
    const retryAlert = await players[0].getByRole('alert').boundingBox();
    const toolsDrawer = await players[0].locator('.tools-drawer').boundingBox();
    if (!drawingHostDuringRetry || !retryAlert || !toolsDrawer) {
      throw new Error('retry state must keep its alert, tools, and drawing host laid out');
    }
    expect(Math.abs(drawingHostDuringRetry.height - drawingHostBeforeRetry.height)).toBeLessThan(2);
    expect(retryAlert.height).toBeLessThan(80);
    expect(
      retryAlert.y + retryAlert.height <= toolsDrawer.y ||
        retryAlert.y >= toolsDrawer.y + toolsDrawer.height
    ).toBe(true);
    await expect(players[0].getByRole('alert')).toHaveText(/Back online.*submit/i, {
      timeout: 5000
    });
    await expect(players[0].locator('[role="status"].visually-hidden')).toContainText('Connected');
    await expect(players[0].getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();

    await drawStroke(players[1]);
    await players[1].getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(tv.getByText('What did they draw?')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('late join mid-drawing becomes spectator and promotes next round', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);
    await hostSaveRounds(players[0], '2');
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    for (const player of players) {
      await expect(player.locator('#prompt-text')).toContainText(/^Draw:/);
    }

    const lateContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(lateContext);
    const late = await lateContext.newPage();
    await late.goto(appUrl(`/join/${roomCode}`));
    await late.getByPlaceholder('Your name').fill('Late');
    await late.getByRole('button', { name: 'Join the Party' }).click();

    await expect(late.getByText('Spectating', { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(late.getByText(/Watching|join as a player|next drawing round/i).first()).toBeVisible();
    await expect(late.locator('canvas.draw-canvas')).toHaveCount(0);
    await expect(tv.locator('.spectator-watchers').getByText('Late')).toBeVisible();
    await expect(tv.locator('.spectator-watchers .spectator-pill').first()).toBeVisible();

    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    // Burn through the first round of reveals so the room advances to round 2 drawing.
    for (let turn = 0; turn < players.length; turn += 1) {
      await expect(tv.getByText('What did they draw?')).toBeVisible();
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`late fake ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }
      await expect(tv.getByText('Which title is real?')).toBeVisible();
      for (const voter of guessers) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }
      await expect(tv.getByText('The real prompt was')).toBeVisible();
      await expect(tv.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 7000 });
      await tv.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(tv.getByText(/Round 2 of \d+/)).toBeVisible();
    await expect(late.locator('#prompt-text')).toContainText(/^Draw:/, { timeout: 5000 });
    await expect(late.getByRole('button', { name: 'Submit Drawing' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('disconnected drawer does not stall drawing phase', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    const dropout = players[2];
    await dropout.context().close();
    const remaining = players.slice(0, 2);

    for (const player of remaining) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible({ timeout: 10000 });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a vote interrupted by reconnect can be submitted again', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava', 'Bo', 'Cy'],
      undefined,
      async (context) => {
        await context.addInitScript(() => {
          const NativeWebSocket = window.WebSocket;
          const sockets: WebSocket[] = [];
          Object.defineProperty(window, '__drawPartyTestSockets', { value: sockets });
          window.WebSocket = new Proxy(NativeWebSocket, {
            construct(target, args) {
              const socket = Reflect.construct(target, args) as WebSocket;
              sockets.push(socket);
              return socket;
            }
          });
        });
      }
    );

    await tv.getByRole('button', { name: 'Start Game' }).click();
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible();
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`reconnect fake ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    await expect(tv.getByText('Which title is real?')).toBeVisible();

    const interruptedVoter = guessers[0];
    const interruptedOption = interruptedVoter.locator('button.vote-option:not([disabled])').first();
    await expect(interruptedOption).toBeVisible();
    await interruptedVoter.evaluate(() => {
      const sockets = (
        window as typeof window & { __drawPartyTestSockets: WebSocket[] }
      ).__drawPartyTestSockets;
      const socket = sockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN);
      if (!socket) {
        throw new Error('expected an open player WebSocket');
      }
      const send = socket.send.bind(socket);
      socket.send = (data) => {
        if (typeof data === 'string' && JSON.parse(data).type === 'submitVote') {
          socket.close();
          return;
        }
        send(data);
      };
    });
    await interruptedOption.click();

    await expect(interruptedVoter.locator('#connection-text')).not.toHaveText('Connected');
    await expect(interruptedVoter.locator('#connection-text')).toHaveText('Connected', {
      timeout: 5000
    });
    await expect(interruptedVoter.locator('button.vote-option:not([disabled])').first()).toBeVisible();
    await interruptedVoter.locator('button.vote-option:not([disabled])').first().click();
    await expect(interruptedVoter.locator('button.vote-option.is-selected')).toHaveCount(1);

    await interruptedVoter.evaluate(() => {
      const sockets = (
        window as typeof window & { __drawPartyTestSockets: WebSocket[] }
      ).__drawPartyTestSockets;
      const socket = sockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN);
      if (!socket) throw new Error('expected an open player WebSocket');
      const send = socket.send.bind(socket);
      let rewroteReaction = false;
      socket.send = (data) => {
        if (!rewroteReaction && typeof data === 'string') {
          const message = JSON.parse(data) as { type?: string; emoji?: string };
          if (message.type === 'sendReaction') {
            rewroteReaction = true;
            message.emoji = 'not-a-reaction';
            send(JSON.stringify(message));
            return;
          }
        }
        send(data);
      };
    });
    await interruptedVoter.getByRole('button', { name: '😂' }).click();
    await expect(interruptedVoter.getByRole('alert')).toContainText('That reaction is not available.');
    await expect(interruptedVoter.locator('button.vote-option.is-selected')).toHaveCount(1);

    const remainingVoter = guessers[1];
    await remainingVoter.evaluate(() => {
      const sockets = (
        window as typeof window & { __drawPartyTestSockets: WebSocket[] }
      ).__drawPartyTestSockets;
      const socket = sockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN);
      if (!socket) throw new Error('expected an open player WebSocket');
      const send = socket.send.bind(socket);
      let rewroteVote = false;
      socket.send = (data) => {
        if (!rewroteVote && typeof data === 'string') {
          const message = JSON.parse(data) as { type?: string; turnToken?: number };
          if (message.type === 'submitVote') {
            rewroteVote = true;
            message.turnToken = Math.max(0, (message.turnToken ?? 1) - 1);
            send(JSON.stringify(message));
            return;
          }
        }
        send(data);
      };
    });
    await remainingVoter.locator('button.vote-option:not([disabled])').first().click();
    await expect(remainingVoter.getByRole('alert')).toBeVisible();
    await expect(remainingVoter.locator('button.vote-option:not([disabled])').first()).toBeVisible();
    await remainingVoter.locator('button.vote-option:not([disabled])').first().click();
    await expect(tv.getByText('The real prompt was')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
