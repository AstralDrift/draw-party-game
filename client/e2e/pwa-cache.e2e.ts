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

test('keeps app routes on the browser shell and API routes on JSON', async ({ page, request }) => {
  const joinResponse = await request.get('/join/ABCD');
  expect(joinResponse.ok()).toBe(true);
  expect(joinResponse.headers()['content-type']).toMatch(/text\/html/);
  expect(await joinResponse.text()).toContain('<div id="app"></div>');

  const healthResponse = await request.get('/api/health');
  expect(healthResponse.ok()).toBe(true);
  await expect(healthResponse.json()).resolves.toMatchObject({
    ok: true,
    service: 'draw-party-server'
  });

  await page.goto('/join/ABCD');
  await expect(page.getByText('Join Game')).toBeVisible();
  await expect(page.locator('input.code-input')).toHaveValue('ABCD');
  await page.locator('input.code-input').fill('A');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('Enter the four-letter room code from the TV.')).toBeVisible();
});
