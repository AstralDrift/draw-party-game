import { expect, test } from '@playwright/test';

test('serves the service worker as JavaScript with cache handling', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/javascript/);

  const body = await response.text();
  expect(body).toContain('draw-party-shell');
  expect(body).toContain("caches.open(CACHE_NAME)");
  expect(body).toContain("request.mode === 'navigate'");
  expect(body).toContain("url.pathname.startsWith('/api/')");
});

test('installs into the manual phone join route', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    id: '/',
    start_url: '/join'
  });
});

test('keeps app routes on the browser shell and API routes on JSON', async ({ page, request }) => {
  const manualJoinResponse = await request.get('/join');
  expect(manualJoinResponse.ok()).toBe(true);
  expect(manualJoinResponse.headers()['content-type']).toMatch(/text\/html/);
  expect(manualJoinResponse.headers()['cache-control']).toBe('no-cache');

  const joinResponse = await request.get('/join/ABCD');
  expect(joinResponse.ok()).toBe(true);
  expect(joinResponse.headers()['content-type']).toMatch(/text\/html/);
  expect(joinResponse.headers()['cache-control']).toBe('no-cache');
  expect(await joinResponse.text()).toContain('<div id="app"></div>');

  const healthResponse = await request.get('/api/health');
  expect(healthResponse.ok()).toBe(true);
  await expect(healthResponse.json()).resolves.toMatchObject({
    ok: true,
    service: 'draw-party-server'
  });

  await page.goto('/join');
  await expect(page.getByText('Join Game')).toBeVisible();
  await expect(page.locator('input.code-input')).toHaveValue('');

  await page.goto('/join/ABCD');
  await expect(page.getByText('Join Game')).toBeVisible();
  await expect(page.locator('.player-room-chip')).toContainText('ABCD');
  await expect(page.locator('input.code-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Join the Party' }).click();
  await expect(page.getByRole('alert')).toHaveText(/enter your name/i);
  await page.getByRole('button', { name: /Change room/i }).click();
  await expect(page.locator('input.code-input')).toBeVisible();
});
