import { expect, test } from '@playwright/test';
import { defaultRoomSettings, type GameAward, type RoomSnapshot } from '../src/protocol';
import { assertAllWithinViewport } from './helpers';

// Fixed authoritative snapshot isolates the worst layout case from random scoring.
test('eight tied finalists and shared awards keep TV and phone rematch reachable', async ({ browser, baseURL }, testInfo) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 3840, height: 2160 }, { width: 375, height: 667 }]) {
    const phone = viewport.width === 375;
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.routeWebSocket('**/ws?*', (socket) => {
        const clientId = new URL(socket.url()).searchParams.get('client_id')!;
        const players = Array.from({ length: 8 }, (_, index) => ({
          id: index === 0 ? clientId : `player-${index}`,
          name: `Alexandria McDoodleton ${index}`,
          score: 650, connected: true, spectator: false, isHost: index === 0
        }));
        const winners = players.map((player) => ({ playerId: player.id, name: player.name }));
        const kinds: GameAward['kind'][] = ['masterBluffer', 'truthDetective', 'picturePerfect'];
        const snapshot: RoomSnapshot = {
          roomCode: 'SHOW', phase: 'finalScores', players, minPlayers: 3, maxPlayers: 8,
          currentRound: 2, totalRounds: 2, settings: defaultRoomSettings(), turnToken: 99,
          serverNowMs: Date.now(), deadlineMs: Date.now() - 1, gameMode: 'party',
          votingOptions: [], finalScores: players.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
          drawingSubmittedIds: [], guessSubmittedIds: [], voteSubmittedIds: [],
          gameAwards: kinds.map((kind) => ({ kind, value: 6, winners }))
        };
        socket.onMessage((message) => {
          const request = JSON.parse(String(message));
          if (request.type === 'createRoom' || request.type === 'joinRoom') {
            socket.send(JSON.stringify({ type: 'roomCreated', snapshot, hostToken: 'fixture-host' }));
          }
        });
      });
      await page.goto(`${baseURL}${phone ? '/join/SHOW' : '/'}`);
      if (phone) {
        await page.getByPlaceholder('Your name').fill('Alexandria');
        await page.getByRole('button', { name: 'Join the Party', exact: true }).click();
      }
      await expect(page.locator('.podium-place')).toHaveCount(8);
      await expect(page.locator('.game-award')).toHaveCount(3);
      await assertAllWithinViewport(page, ['.podium-place', '.game-award', phone ? '.encore-panel button' : '.tv-finale-actions']);
      await page.screenshot({ path: testInfo.outputPath(`tied-finale-${viewport.width}.png`) });
    } finally {
      await context.close();
    }
  }
});
