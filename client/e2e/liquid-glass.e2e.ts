import { expect, test, type Page } from '@playwright/test';

const DISPLAY_VIEWPORTS = [
  { name: 'tv-720p', width: 1280, height: 720 },
  { name: 'tv-4k', width: 3840, height: 2160 }
];

const PLAYER_VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, isMobile: true, deviceScaleFactor: 2 },
  { name: 'android-large', width: 412, height: 915, isMobile: true, deviceScaleFactor: 3 },
  { name: 'ipad', width: 768, height: 1024, isMobile: false, deviceScaleFactor: 2 }
];

test('liquid glass design tokens and surfaces are active on the TV lobby', async ({ baseURL, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl(baseURL, '/'));

  await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);

  const metrics = await page.evaluate(async () => {
    const root = getComputedStyle(document.documentElement);
    const panel = getComputedStyle(document.querySelector('.panel') as HTMLElement);
    const topbar = getComputedStyle(document.querySelector('.topbar') as HTMLElement);
    const primary = getComputedStyle(document.querySelector('.primary') as HTMLElement);

    const glassFilter = (style: CSSStyleDeclaration) =>
      style.backdropFilter && style.backdropFilter !== 'none'
        ? style.backdropFilter
        : style.getPropertyValue('-webkit-backdrop-filter');
    const rules = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText);
      } catch {
        return [];
      }
    });
    const linkedCss = (
      await Promise.all(
        Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) =>
          fetch(link.href)
            .then((response) => response.text())
            .catch(() => '')
        )
      )
    ).join('\n');
    const declaredGlassFilter = (selector: string) =>
      rules.some((rule) => rule.includes(selector) && rule.includes('backdrop-filter') && rule.includes('blur(')) ||
      (linkedCss.includes(selector) && linkedCss.includes('backdrop-filter') && linkedCss.includes('blur('));

    return {
      glassBg: root.getPropertyValue('--liquid-glass-bg').trim(),
      glassEdge: root.getPropertyValue('--liquid-glass-edge').trim(),
      radiusCard: Number.parseFloat(root.getPropertyValue('--liquid-radius-card')),
      panelBackdrop: glassFilter(panel) || (declaredGlassFilter('.panel') ? 'blur-declared' : ''),
      panelRadius: Number.parseFloat(panel.borderRadius),
      panelBackground: panel.backgroundImage + panel.backgroundColor,
      topbarBackdrop: glassFilter(topbar) || (declaredGlassFilter('.topbar') ? 'blur-declared' : ''),
      topbarBackground: topbar.backgroundImage + topbar.backgroundColor,
      primaryRadius: Number.parseFloat(primary.borderRadius)
    };
  });

  expect(metrics.glassBg).not.toBe('');
  expect(metrics.glassBg).not.toBe('transparent');
  expect(metrics.glassEdge).not.toBe('');
  expect(metrics.glassEdge).not.toBe('transparent');
  expect(metrics.radiusCard).toBeGreaterThanOrEqual(28);
  expect(metrics.panelBackdrop).toContain('blur');
  expect(metrics.panelRadius).toBeGreaterThanOrEqual(28);
  expect(metrics.panelBackground).toContain('rgba');
  expect(metrics.topbarBackdrop).toContain('blur');
  expect(metrics.topbarBackground).toContain('rgba');
  expect(metrics.primaryRadius).toBeGreaterThanOrEqual(999);
});

test('liquid glass lobby stays fluid across TV, phone, Android, and tablet viewports', async ({ baseURL, browser }) => {
  for (const viewport of DISPLAY_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      const page = await context.newPage();
      await page.goto(appUrl(baseURL, '/'));
      await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
      await expectNoHorizontalOverflow(page);
      await expectNoVerticalOverflow(page);
      await expect(page.locator('.room-panel')).toBeVisible();
      await expect(page.locator('.settings-panel')).toBeVisible();
    } finally {
      await context.close();
    }
  }

  for (const viewport of PLAYER_VIEWPORTS) {
    const context = await browser.newContext({
      hasTouch: viewport.isMobile,
      isMobile: viewport.isMobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      viewport: { width: viewport.width, height: viewport.height }
    });
    try {
      const page = await context.newPage();
      await page.goto(appUrl(baseURL, '/join/ABCD'));
      await expect(page.getByRole('heading', { name: 'Join the party' })).toBeVisible();
      await expect(page.locator('.player-join-card')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  }
});

function appUrl(baseURL: string | undefined, path: string): string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return new URL(path, baseURL).toString();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(window.innerWidth) + 1))
    .toBe(true);
}

async function expectNoVerticalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Math.ceil(document.documentElement.scrollHeight) <= Math.ceil(window.innerHeight) + 4))
    .toBe(true);
}
