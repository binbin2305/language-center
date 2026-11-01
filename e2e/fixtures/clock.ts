import { test as base, expect, type Page } from '@playwright/test';
import { CLOCK_START } from './accounts';

/**
 * Base test for every E2E spec (D30): the page clock starts at CLOCK_START — the same instant as the
 * api's APP_CLOCK_START — before any navigation, and keeps running (not paused).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date(CLOCK_START) });
    await use(page);
  },
});

export { expect };

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
