import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { CLOCK_START } from './accounts';

/**
 * Base test for every E2E spec (D30): the `context` fixture (and so `page`) gets a clock starting at
 * CLOCK_START — the api's APP_CLOCK_START — before any navigation; the clock keeps running (not paused).
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.clock.install({ time: new Date(CLOCK_START) });
    await use(context);
  },
});

export { expect };

/** Extra context (multi-role specs) with the same clock as the `context` fixture; the caller closes it. */
export async function newClockedContext(browser: Browser, opts?: BrowserContextOptions): Promise<BrowserContext> {
  const ctx = await browser.newContext(opts);
  await ctx.clock.install({ time: new Date(CLOCK_START) });
  return ctx;
}

/** D31: teacher/student specs — `test.use(mobile)`. */
export const mobile = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };

/** NFR-05: no horizontal page scroll (scrollingElement.scrollWidth ≤ innerWidth). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: (document.scrollingElement ?? document.documentElement).scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}
