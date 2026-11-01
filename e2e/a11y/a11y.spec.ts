import AxeBuilder from '@axe-core/playwright';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { ACCOUNTS, type Account } from '../fixtures/accounts';
import { apiAs, findTeacherWithUntakenSessionToday } from '../fixtures/api';
import { loginAs } from '../fixtures/auth';
import { expect, mobile, newClockedContext, test } from '../fixtures/clock';

/** H-03 NFR-06: axe wcag2a + wcag2aa on 10 main screens, light and dark; 0 serious/critical violations. */

type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];

interface Ids {
  student: { id: string; account: Account };
  classId: string;
  invoiceId: string;
  session: { id: string; account: Account };
}

async function listFirst(acc: Account, path: string): Promise<Record<string, unknown>> {
  const api = await apiAs(acc);
  try {
    const res = await api.get(path);
    if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    if (data.length === 0) throw new Error(`GET ${path} returned no rows`);
    return data[0];
  } finally {
    await api.dispose();
  }
}

const DARK_TOKENS = /\.dark\s*\{([^}]*)\}/.exec(readFileSync(resolve(__dirname, '../../apps/web/src/index.css'), 'utf8'))?.[1] ?? '';

/**
 * The app has no theme toggle; dark mode = `.dark` on <html> (index.css tokens). Set it that way and assert it took.
 * CR L-HARDENING-4: Tailwind purges the `.dark` token block from the production CSS, so when the served stylesheets
 * contain no `.dark` rule the source tokens are injected, to still audit the dark palette's contrast.
 */
async function setTheme(page: Page, mode: Mode): Promise<void> {
  await page.evaluate((m) => document.documentElement.classList.toggle('dark', m === 'dark'), mode);
  await expect(page.locator('html')).toHaveClass(mode === 'dark' ? /(^|\s)dark(\s|$)/ : /^(?!.*\bdark\b).*$/);
  if (mode === 'dark') {
    const served = await page.evaluate(() =>
      Array.from(document.styleSheets).some((s) => {
        try {
          return Array.from(s.cssRules).some((r) => r.cssText.includes('.dark'));
        } catch {
          return false; // cross-origin font sheet
        }
      }),
    );
    if (!served) await page.addStyleTag({ content: `html.dark{${DARK_TOKENS}}` });
  }
  // no colour transitions in flight when axe samples computed colours
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const sum = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0));
  if (mode === 'dark') await expect.poll(sum).toBeLessThan(150);
  else await expect.poll(sum).toBeGreaterThan(600);
}

async function scan(page: Page, mode: Mode): Promise<void> {
  await setTheme(page, mode);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
      detail: v.id === 'color-contrast' ? v.nodes.slice(0, 2).map((n) => (n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined)) : undefined,
    }));
  if (process.env.A11Y_DUMP) appendFileSync(process.env.A11Y_DUMP, `${JSON.stringify({ test: test.info().title, bad })}\n`);
  expect(bad, `axe ${mode}: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
}

let ids: Ids;

test.beforeAll(async () => {
  const st = await listFirst(ACCOUNTS.manager, 'students');
  const cls = await listFirst(ACCOUNTS.manager, 'classes');
  const inv = await listFirst(ACCOUNTS.manager, 'invoices');
  const found = await findTeacherWithUntakenSessionToday();
  ids = {
    student: { id: String(st.id), account: { username: String(st.code), password: ACCOUNTS.manager.password } },
    classId: String(cls.id),
    invoiceId: String(inv.id),
    session: { id: found.sessionId, account: found.account },
  };
});

interface Screen {
  name: string;
  account?: Account;
  mobile?: boolean;
  home?: string | RegExp;
  path: () => string;
  ready: string | RegExp;
}

const SCREENS: Screen[] = [
  { name: '/login', path: () => '/login', ready: 'Đăng nhập' },
  { name: 'M / (dashboard)', account: ACCOUNTS.manager, home: 'Tổng quan', path: () => '/', ready: 'Tổng quan' },
  { name: 'S /admissions/leads', account: ACCOUNTS.staff1, path: () => '/admissions/leads', ready: /./ },
  { name: 'S /admissions/leads/new', account: ACCOUNTS.staff1, path: () => '/admissions/leads/new', ready: /./ },
  { name: 'S /students/:id', account: ACCOUNTS.staff1, path: () => `/students/${ids.student.id}`, ready: /./ },
  { name: 'S /classes/:id', account: ACCOUNTS.staff1, path: () => `/classes/${ids.classId}`, ready: /./ },
  { name: 'S /fees/invoices/:id', account: ACCOUNTS.staff1, path: () => `/fees/invoices/${ids.invoiceId}`, ready: /./ },
  { name: 'M /reports', account: ACCOUNTS.manager, path: () => '/reports', ready: /./ },
  { name: 'T mobile /sessions/:id/attendance', mobile: true, path: () => `/sessions/${ids.session.id}/attendance`, ready: /./ },
  { name: 'H mobile /', account: undefined, mobile: true, path: () => '/', ready: /./ },
];

/** Known product violations (docs/contract-requests): `<screen name> (<mode>)` -> CR ids. Unmarked screens must be clean. */
const CRS: Record<string, string> = {
  '/login (dark)': 'L-HARDENING-6',
  '/admissions/leads (light)': 'L-HARDENING-5',
  '/admissions/leads (dark)': 'L-HARDENING-6',
  '/admissions/leads/new (light)': 'L-HARDENING-5',
  '/admissions/leads/new (dark)': 'L-HARDENING-6',
  '/students/:id (light)': 'L-HARDENING-5',
  '/students/:id (dark)': 'L-HARDENING-6',
  '/classes/:id (light)': 'L-HARDENING-5',
  '/classes/:id (dark)': 'L-HARDENING-6',
  '/fees/invoices/:id (light)': 'L-HARDENING-5',
  '/fees/invoices/:id (dark)': 'L-HARDENING-6',
  '/reports (light)': 'L-HARDENING-5 + L-HARDENING-7',
  '/reports (dark)': 'L-HARDENING-6 + L-HARDENING-7',
  '/sessions/:id/attendance (light)': 'L-HARDENING-5',
  '/sessions/:id/attendance (dark)': 'L-HARDENING-6',
};

test('NFR-06 a11y tokens .dark có trong CSS production', async ({ page }) => {
  test.fail(true, 'CR L-HARDENING-4');
  await page.goto('/login');
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => (l as HTMLLinkElement).href).filter((h) => h.startsWith(location.origin)));
  const css = (await Promise.all(hrefs.map(async (h) => (await page.request.get(h)).text()))).join('\n');
  expect(css).toContain('.dark');
});

for (const screen of SCREENS) {
  for (const mode of MODES) {
    test(`NFR-06 a11y ${screen.name} (${mode})`, async ({ page, browser }) => {
      const cr = CRS[`${screen.name.replace(/^[MSTH] (mobile )?/, '')} (${mode})`];
      if (cr) test.fail(true, `CR ${cr}`);
      const isT = screen.name.startsWith('T ');
      const isH = screen.name.startsWith('H ');
      const ctx = screen.mobile ? await newClockedContext(browser, mobile) : null;
      try {
        const pg = ctx ? await ctx.newPage() : page;
        if (isT) await loginAs(pg, ids.session.account);
        else if (isH) await loginAs(pg, ids.student.account);
        else if (screen.account) await loginAs(pg, screen.account, { expectHome: screen.home });
        else await pg.goto('/login');
        if (screen.account || isT || isH) await pg.goto(screen.path());
        const h1 = pg.getByRole('heading', { level: 1 }).first();
        await expect(h1).toBeVisible({ timeout: 15_000 });
        await expect(h1).toHaveText(screen.ready);
        await pg.waitForLoadState('networkidle');
        await scan(pg, mode);
      } finally {
        await ctx?.close();
      }
    });
  }
}
