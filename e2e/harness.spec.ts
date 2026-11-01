import { vnDay } from '../packages/shared/src/time';
import { ACCOUNTS, DEMO_TODAY } from './fixtures/accounts';
import { apiAs, findTeacherWithUntakenSessionToday } from './fixtures/api';
import { loginAs } from './fixtures/auth';
import { expect, test } from './fixtures/clock';

test.describe('Harness E2E', () => {
  test('M đăng nhập thấy dashboard h1', async ({ page }) => {
    await loginAs(page, ACCOUNTS.manager);
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  });

  test('ngày trong trình duyệt (vnDay(Date.now())) = DEMO_TODAY và dashboard có ≥ 1 buổi hôm nay', async ({ page }) => {
    await page.goto('/login');
    const browserNow = await page.evaluate(() => Date.now());
    expect(vnDay(new Date(browserNow))).toBe(DEMO_TODAY);

    const api = await apiAs(ACCOUNTS.manager);
    const res = await api.get('reports/dashboard');
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { todaySessions: { startAt: string }[] } };
    await api.dispose();
    expect(data.todaySessions.length).toBeGreaterThanOrEqual(1);
    expect(vnDay(new Date(data.todaySessions[0].startAt))).toBe(vnDay(new Date(browserNow)));
  });

  test('findTeacherWithUntakenSessionToday() trả buổi SCHEDULED chưa điểm danh', async () => {
    const found = await findTeacherWithUntakenSessionToday();
    expect(found.classCode).not.toBe('');
    const api = await apiAs(found.account);
    const res = await api.get(`sessions/${found.sessionId}`);
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { status: string; attendanceTakenAt: string | null; classCode: string; startAt: string } };
    await api.dispose();
    expect(data.status).toBe('SCHEDULED');
    expect(data.attendanceTakenAt).toBeNull();
    expect(data.classCode).toBe(found.classCode);
    expect(vnDay(new Date(data.startAt))).toBe(DEMO_TODAY);
  });

  test('GET /api/v1/health qua proxy 4173 → 200', async ({ request }) => {
    const res = await request.get('/api/v1/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 'ok', db: 'up' } });
  });
});
