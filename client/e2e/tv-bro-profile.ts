import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type TvViewport } from './tv-layout';

/**
 * Android TV System WebView–shaped Chromium profile for CI pixel previews.
 * Matches TV Bro's default engine (Blink/WebView), not GeckoView.
 */
export const TV_BRO_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV Build/RTM5.220922.014; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Safari/537.36';

/** Glass UI tolerates tiny AA/font differences; intentional CSS changes still fail. */
export const TV_BRO_SCREENSHOT_OPTIONS = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.012
};

export type TvBroDisplay = {
  context: BrowserContext;
  page: Page;
};

export async function openTvBroDisplay(
  browser: Browser,
  viewport: Pick<TvViewport, 'width' | 'height'>,
  appUrl: (path: string) => string
): Promise<TvBroDisplay> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    userAgent: TV_BRO_WEBVIEW_USER_AGENT,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
  await expect(page.locator('.qr')).toBeVisible();
  return { context, page };
}

/** Room code + QR rotate every run; timers tick — mask so baselines stay stable. */
export async function tvBroScreenshotMasks(page: Page) {
  return [
    page.locator('.room-code'),
    page.locator('.qr'),
    page.locator('.deadline'),
    page.locator('#deadline-text')
  ];
}
