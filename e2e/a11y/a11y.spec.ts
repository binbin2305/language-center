import AxeBuilder from '@axe-core/playwright';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { ACCOUNTS, type Account } from '../fixtures/accounts';
import { apiAs, findTeacherWithUntakenSessionToday } from '../fixtures/api';
import { loginAs } from '../fixtures/auth';
import { expect, mobile, newClockedContext, test } from '../fixtures/clock';

/** H-03 NFR-06: axe wcag2a + wcag2aa on 10 main screens, light and dark; 0 serious/critical violations except the known CRs. */

/**
 * CR L-HARDENING-4 is fixed (lane/L-LEAD 3aee0dd, Ruling R15: the app follows `prefers-color-scheme` live + a user-menu
 * toggle Hệ thống/Sáng/Tối, and the built CSS keeps the `.dark` block). Dark scans get no help; the two CR-4 tests below
 * require the real behaviour. Set back to true only with a Lead ruling.
 */
const CR4_OPEN = false;

type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];

/**
 * Known product violations: `<screen> (<mode>)` -> { axe rule id -> CR }. A listed screen must produce EXACTLY these
 * rule ids at serious/critical (non-empty and no others), so it fails loudly both on a new violation and when a CR is fixed
 * (then delete the entry). Unlisted screens must be clean.
 */
const KNOWN: Record<string, Record<string, string>> = {};

const DARK_TOKENS = /\.dark\s*\{([^}]*)\}/.exec(readFileSync(resolve(__dirname, '../../apps/web/src/index.css'), 'utf8'))?.[1] ?? '';

const hasDarkClass = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.classList.contains('dark'));

/**
 * True if some served same-origin stylesheet has a `.dark` rule (html.dark / :root.dark / .dark) that declares a real
 * design token (`--background`), so an empty or unrelated `.dark` selector does not count.
 */
const darkRuleServed = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const declaresToken = (rules: CSSRuleList): boolean =>
      Array.from(rules).some((r) => {
        if ('cssRules' in r && !('selectorText' in r)) return declaresToken((r as CSSGroupingRule).cssRules); // @layer / @media
        const rule = r as CSSStyleRule;
        return /(^|[\s,])(html|:root)?\.dark([\s,{:]|$)/.test(rule.selectorText ?? '') && (rule.style?.getPropertyValue('--background') ?? '').trim() !== '';
      });
    return Array.from(document.styleSheets).some((s) => {
      try {
        return declaresToken(s.cssRules);
      } catch {
        return false; // cross-origin font sheet
      }
    });
  });

/** Applies the mode: the app does it itself (prefers-color-scheme); with CR 4 open a workaround stands in for it. */
async function ensureTheme(page: Page, mode: Mode): Promise<void> {
  if (mode === 'dark' && CR4_OPEN) {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    if (!(await darkRuleServed(page))) await page.addStyleTag({ content: `html.dark{${DARK_TOKENS}}` });
  }
  expect(await hasDarkClass(page), `html.dark when colorScheme=${mode}`).toBe(mode === 'dark');
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const sum = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0));
  if (mode === 'dark') await expect.poll(sum).toBeLessThan(150);
  else await expect.poll(sum).toBeGreaterThan(600);
}

async function scan(page: Page, mode: Mode, key: string): Promise<void> {
  await ensureTheme(page, mode);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
      detail: v.id === 'color-contrast' ? v.nodes.slice(0, 2).map((n) => n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined) : undefined,
    }));
  if (process.env.A11Y_DUMP) appendFileSync(process.env.A11Y_DUMP, `${JSON.stringify({ test: test.info().title, bad })}\n`);
  const known = KNOWN[key];
  if (!known) {
    expect(bad, `axe ${mode}: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
    return;
  }
  const ids = [...new Set(bad.map((b) => b.id))].sort();
  expect(ids, `known violations ${JSON.stringify(known)} (empty = fixed, delete the KNOWN entry); got ${JSON.stringify(bad, null, 1)}`).toEqual(Object.keys(known).sort());
}

async function first(acc: Account, path: string): Promise<Record<string, unknown>> {
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

interface Ids {
  student: { id: string; name: string; account: Account };
  cls: { id: string; name: string };
  invoice: { id: string; code: string };
  session: { id: string; classCode: string; account: Account };
}
let ids: Ids;

test.beforeAll(async () => {
  const st = await first(ACCOUNTS.manager, 'students');
  const cls = await first(ACCOUNTS.manager, 'classes');
  const inv = await first(ACCOUNTS.manager, 'invoices');
  const found = await findTeacherWithUntakenSessionToday();
  ids = {
    student: { id: String(st.id), name: String(st.fullName), account: { username: String(st.code), password: ACCOUNTS.manager.password } },
    cls: { id: String(cls.id), name: String(cls.name) },
    invoice: { id: String(inv.id), code: String(inv.code) },
    session: { id: found.sessionId, classCode: found.classCode, account: found.account },
  };
});

interface Screen {
  name: string;
  login?: () => Account;
  mobile?: boolean;
  home?: string;
  path: () => string;
  h1: () => string | RegExp;
  /** a data-bearing element proving the content (not a skeleton) rendered */
  data: (p: Page) => Locator;
}

const SCREENS: Screen[] = [
  { name: '/login', path: () => '/login', h1: () => 'Đăng nhập', data: (p) => p.getByLabel('Mật khẩu', { exact: true }) },
  { name: 'M /', login: () => ACCOUNTS.manager, home: 'Tổng quan', path: () => '/', h1: () => 'Tổng quan', data: (p) => p.getByText('HV đang học').first() },
  { name: 'S /admissions/leads', login: () => ACCOUNTS.staff1, path: () => '/admissions/leads', h1: () => 'Tuyển sinh', data: (p) => p.getByRole('table').locator('tbody tr').first() },
  { name: 'S /admissions/leads/new', login: () => ACCOUNTS.staff1, path: () => '/admissions/leads/new', h1: () => 'Tiếp nhận lead', data: (p) => p.getByLabel(/Họ và tên/).first() },
  { name: 'S /students/:id', login: () => ACCOUNTS.staff1, path: () => `/students/${ids.student.id}`, h1: () => 'Hồ sơ học viên', data: (p) => p.getByText(ids.student.name).first() },
  { name: 'S /classes/:id', login: () => ACCOUNTS.staff1, path: () => `/classes/${ids.cls.id}`, h1: () => ids.cls.name, data: (p) => p.getByRole('tab').first() },
  { name: 'S /fees/invoices/:id', login: () => ACCOUNTS.staff1, path: () => `/fees/invoices/${ids.invoice.id}`, h1: () => `Hóa đơn ${ids.invoice.code}`, data: (p) => p.getByText(ids.invoice.code).first() },
  { name: 'M /reports', login: () => ACCOUNTS.manager, path: () => '/reports', h1: () => 'Báo cáo', data: (p) => p.getByRole('tab').first() },
  { name: 'T mobile /sessions/:id/attendance', login: () => ids.session.account, mobile: true, path: () => `/sessions/${ids.session.id}/attendance`, h1: () => new RegExp(ids.session.classCode), data: (p) => p.getByRole('listitem').first() },
  { name: 'H mobile /', login: () => ids.student.account, mobile: true, path: () => '/', h1: () => 'Trang của tôi', data: (p) => p.getByText('Buổi học tiếp theo').first() },
];

for (const screen of SCREENS) {
  for (const mode of MODES) {
    test(`NFR-06 a11y ${screen.name} (${mode})`, async ({ page, browser }) => {
      const key = `${screen.name.replace(/^[MSTH] (mobile )?/, '')} (${mode})`;
      const ctx = screen.mobile ? await newClockedContext(browser, mobile) : null;
      try {
        const pg = ctx ? await ctx.newPage() : page;
        await pg.emulateMedia({ colorScheme: mode });
        // navigation and readiness are real failures (never swallowed by the known-violations logic)
        if (screen.login) {
          await loginAs(pg, screen.login(), { expectHome: screen.home });
          await pg.goto(screen.path());
        } else await pg.goto(screen.path());
        await expect(pg.getByRole('heading', { level: 1 }).first()).toHaveText(screen.h1(), { timeout: 15_000 });
        await expect(screen.data(pg)).toBeVisible({ timeout: 15_000 });
        await pg.waitForLoadState('networkidle');
        await scan(pg, mode, key);
      } finally {
        await ctx?.close();
      }
    });
  }
}

test('NFR-06 a11y CR 4: app sets html.dark from prefers-color-scheme: dark and ships the .dark tokens', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const works = (await hasDarkClass(page)) && (await darkRuleServed(page));
  expect(works, 'CR L-HARDENING-4: html.dark + served .dark tokens (set CR4_OPEN=false once fixed)').toBe(!CR4_OPEN);
});

test('NFR-06 a11y CR 4: user-menu theme toggle Hệ thống/Sáng/Tối persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, ACCOUNTS.manager, { expectHome: 'Tổng quan' });
  await page.getByRole('button', { name: 'Tài khoản của tôi' }).click();
  const item = (name: string) => page.getByRole('menuitemradio', { name, exact: true });
  const present = [await item('Hệ thống').count(), await item('Sáng').count(), await item('Tối').count()].every((n) => n === 1);
  expect(present, 'CR L-HARDENING-4: menuitemradio Hệ thống/Sáng/Tối in "Tài khoản của tôi" (set CR4_OPEN=false once fixed)').toBe(!CR4_OPEN);
  if (CR4_OPEN) return;
  await item('Tối').click();
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/); // persisted (localStorage)
  await page.getByRole('button', { name: 'Tài khoản của tôi' }).click();
  await item('Sáng').click();
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await page.getByRole('button', { name: 'Tài khoản của tôi' }).click();
  await item('Hệ thống').click(); // follows OS (light here)
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/); // live OS follow
});
