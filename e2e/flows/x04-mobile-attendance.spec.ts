import type { Page } from '@playwright/test';
import { ACCOUNTS } from '../fixtures/accounts';
import { apiAs, findTeacherWithUntakenSessionToday } from '../fixtures/api';
import { changePasswordFirstLogin, loginAs } from '../fixtures/auth';
import { expect, expectNoHorizontalScroll, mobile, newClockedContext, test } from '../fixtures/clock';

test.use(mobile);

interface RosterRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  status: string | null;
  history: { from: string | null; to: string; reason?: string }[];
}

/** Review Focus 5: a real (non-forced) click must land on the save button, not on the bottom nav. */
async function expectSaveButtonClickable(page: Page, name: string): Promise<void> {
  const btn = page.getByRole('button', { name, exact: true });
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();
  const hit = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === el || (top !== null && el.contains(top));
  });
  expect(hit, `elementFromPoint at the centre of "${name}" is not the button (covered)`).toBe(true);
}

test('FR-ATT-02 FR-ATT-03 FR-ATT-04 GV 375px điểm danh buổi hôm nay → sửa Đi muộn → HV thấy lịch sử', async ({ page, browser }) => {
  const { account, sessionId, classCode } = await findTeacherWithUntakenSessionToday();
  const staff = await apiAs(ACCOUNTS.staff1);
  const rosterOf = async (): Promise<{ taken: boolean; roster: RosterRow[] }> => {
    const res = await staff.get(`sessions/${sessionId}/attendance`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as { data: { taken: boolean; roster: RosterRow[] } }).data;
  };
  try {
    const before = await rosterOf();
    expect(before.taken).toBe(false);
    expect(before.roster.length).toBeGreaterThan(0);
    const first = before.roster[0]!;

    // Teacher: home → "Điểm danh".
    await loginAs(page, account, { expectHome: 'Hôm nay của tôi' });
    const card = page.getByRole('article', { name: `Buổi ${classCode}` });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
    await card.getByRole('link', { name: 'Điểm danh' }).click();
    await expect(page.getByRole('button', { name: 'Tất cả có mặt' })).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Tất cả có mặt' }).click();
    const group = page.getByRole('group', { name: `Trạng thái ${first.fullName}` });
    await group.getByRole('button', { name: 'Vắng KP' }).click();
    await expect(group.getByRole('button', { name: 'Vắng KP' })).toHaveAttribute('aria-pressed', 'true');

    await expectSaveButtonClickable(page, 'Lưu điểm danh');
    await page.getByRole('button', { name: 'Lưu điểm danh', exact: true }).click();
    await expect(page.getByText('Đã lưu điểm danh')).toBeVisible();
    await expectNoHorizontalScroll(page);

    const taken = await rosterOf();
    expect(taken.taken).toBe(true);
    expect(taken.roster.find((r) => r.studentId === first.studentId)?.status).toBe('UNEXCUSED');

    // Reopen and edit the first student to LATE with a reason.
    await page.goto(`/sessions/${sessionId}/attendance`);
    const group2 = page.getByRole('group', { name: `Trạng thái ${first.fullName}` });
    await expect(group2.getByRole('button', { name: 'Vắng KP' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await group2.getByRole('button', { name: 'Muộn' }).click();
    await page.getByLabel(`Lý do thay đổi: ${first.fullName}`).fill('Đến muộn 15 phút');
    await expectSaveButtonClickable(page, 'Lưu thay đổi');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(page.getByText('Đã cập nhật điểm danh')).toBeVisible();

    // API: one history entry UNEXCUSED → LATE.
    const edited = (await rosterOf()).roster.find((r) => r.studentId === first.studentId)!;
    expect(edited.status).toBe('LATE');
    expect(edited.history).toHaveLength(1);
    expect(edited.history[0]).toMatchObject({ from: 'UNEXCUSED', to: 'LATE', reason: 'Đến muộn 15 phút' });

    // Student (mobile, own clocked context) sees today's session as "Đi muộn".
    const ctx = await newClockedContext(browser, mobile);
    try {
      const sp = await ctx.newPage();
      const creds = { username: first.studentCode, password: 'Password1' };
      await loginAs(sp, creds);
      if (/\/change-password/.test(sp.url())) await changePasswordFirstLogin(sp, creds.password, 'Newpass123');
      await sp.goto('/me/attendance');
      await expect(sp.getByRole('heading', { level: 1, name: 'Điểm danh của tôi' })).toBeVisible({ timeout: 10_000 });
      const list = sp.getByRole('list', { name: 'Các buổi đã học' });
      await expect(list).toBeVisible({ timeout: 10_000 });
      const row = list.getByRole('listitem').filter({ hasText: classCode }).filter({ hasText: '02/11' });
      await expect(row).toHaveCount(1);
      await expect(row.getByText('Đi muộn')).toBeVisible();
      await expectNoHorizontalScroll(sp);
    } finally {
      await ctx.close();
    }
  } finally {
    await staff.dispose();
  }
});
