import type { Page } from '@playwright/test';
import { ACCOUNTS } from '../fixtures/accounts';
import { apiAs } from '../fixtures/api';
import { loginAs } from '../fixtures/auth';
import { expect, expectNoHorizontalScroll, mobile, newClockedContext, test } from '../fixtures/clock';
import { runId } from '../fixtures/ids';

/** GET /sessions needs from+to and answers { data } without meta (so counts are data.length). */
interface Paged<T> {
  data: T[];
}
const CLASS_RANGE = { from: '2026-11-01', to: '2026-11-30' };

/** Day button of the open calendar popover (November 2026, the page clock's month). */
const day = (page: Page, d: number) => page.getByRole('button', { name: new RegExp(`ngày ${d} tháng 11 năm 2026$`) }).last(); // last: a just-closed popover may still be unmounting

test('FR-CLS-01 FR-SCH-01 FR-SCH-03 FR-SCH-07 tạo lớp → lịch lặp trùng giờ GV bị chặn → đổi giờ → tạo đủ buổi → GV thấy lịch', async ({ page, browser }) => {
  const classCode = `E2E-${runId}`.toUpperCase();
  const className = `Lớp E2E ${runId}`;
  const staffApi = await apiAs(ACCOUNTS.staff1);
  const teacherApi = await apiAs(ACCOUNTS.teacher2);
  const extraContexts = [];
  try {
    const teacher2 = ((await (await teacherApi.get('auth/me')).json()) as { data: { id: string; fullName: string } }).data;
    const courses = (await (await staffApi.get('courses', { params: { limit: 100 } })).json()) as Paged<{ id: string; code: string; name: string }>;
    const course = courses.data.find((c) => c.code === 'ENG-GT');
    expect(course, 'seeded course ENG-GT').toBeTruthy();

    // Seeded teacher2 session this test collides with: Tue/Thu 18:00-19:30 (IELTS-5.0-01).
    const seeded = (await (await staffApi.get('sessions', { params: { teacherId: teacher2.id, from: '2026-11-03', to: '2026-11-12' } })).json()) as Paged<{ startAt: string }>;
    expect(seeded.data.length, 'teacher2 has seeded sessions in the recurrence window').toBeGreaterThanOrEqual(4);

    // --- FR-CLS-01: staff creates the class through the UI.
    await loginAs(page, ACCOUNTS.staff1);
    await page.goto('/classes');
    await expect(page.getByRole('heading', { level: 1, name: 'Lớp học' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Thêm lớp' }).click();
    const form = page.getByRole('dialog', { name: 'Thêm lớp học' });
    await expect(form).toBeVisible();
    await form.getByLabel(/^Mã lớp/).fill(classCode);
    await form.getByLabel(/^Tên lớp/).fill(className);
    await form.getByRole('combobox', { name: /^Khóa học/ }).click();
    await page.getByRole('option', { name: new RegExp(course!.name) }).click();
    await form.getByLabel(/^Trình độ/).fill('A2');
    await form.getByRole('combobox', { name: /^Giáo viên/ }).click();
    await page.getByRole('option', { name: teacher2.fullName, exact: true }).click();
    await form.getByRole('combobox', { name: /^Phòng mặc định/ }).click();
    await page.getByRole('option').nth(1).click(); // 0 is "Không chọn"
    await form.getByRole('button', { name: /^Ngày khai giảng/ }).click();
    await day(page, 3).click();
    await form.getByRole('button', { name: /^Ngày kết thúc/ }).click();
    await day(page, 30).click();
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });

    const found = (await (await staffApi.get('classes', { params: { q: classCode, limit: 100 } })).json()) as Paged<{ id: string; code: string; status: string }>;
    const cls = found.data.find((c) => c.code === classCode);
    expect(cls, 'class created through the UI').toBeTruthy();
    expect(cls!.status).toBe('PLANNED');

    // --- FR-SCH-01 FR-SCH-03: recurring schedule at the clashing time.
    await page.goto(`/classes/${cls!.id}`);
    await page.getByRole('tab', { name: 'Lịch học' }).click();
    await page.getByRole('button', { name: 'Tạo lịch', exact: true }).click();
    const sched = page.getByRole('dialog', { name: 'Tạo lịch học' });
    await expect(sched).toBeVisible({ timeout: 10_000 });
    await sched.getByRole('tab', { name: 'Lặp lại' }).click();
    const rec = sched.getByRole('tabpanel', { name: 'Lặp lại' });
    await rec.getByRole('combobox', { name: /^Phòng học/ }).click();
    await page.getByRole('option').first().click();
    await rec.getByRole('combobox', { name: /^Giáo viên/ }).click();
    await page.getByRole('option', { name: new RegExp(teacher2.fullName) }).first().click();
    await rec.getByRole('button', { name: 'T3', exact: true }).click();
    await rec.getByRole('button', { name: 'T5', exact: true }).click();
    await rec.getByLabel(/^Giờ bắt đầu/).fill('18:00');
    await rec.getByLabel(/^Giờ kết thúc/).fill('19:30');
    await rec.getByRole('button', { name: /^Từ ngày/ }).click();
    await day(page, 3).click();
    await rec.getByRole('button', { name: /^Đến ngày/ }).click();
    await day(page, 12).click();
    const preview = rec.getByText(/^Sẽ tạo \d+ buổi$/);
    await expect(preview).toBeVisible();
    const n = Number((await preview.innerText()).match(/\d+/)![0]);
    expect(n).toBe(4); // Tue 3, Thu 5, Tue 10, Thu 12

    await expect(rec.getByRole('button', { name: 'Tạo', exact: true })).toBeDisabled();
    await rec.getByRole('button', { name: 'Kiểm tra xung đột' }).click();
    const conflicts = rec.getByRole('list', { name: 'Danh sách xung đột lịch' });
    await expect(conflicts).toBeVisible({ timeout: 10_000 });
    for (const d of ['03/11', '05/11', '10/11', '12/11']) {
      await expect(conflicts.getByRole('listitem').filter({ hasText: d }).first()).toContainText('Trùng giáo viên');
    }
    await expect(rec.getByRole('button', { name: 'Tạo', exact: true })).toBeDisabled();
    expect(((await (await staffApi.get('sessions', { params: { classId: cls!.id, ...CLASS_RANGE } })).json()) as Paged<unknown>).data.length).toBe(0);

    // --- Fix the time: a free slot.
    await rec.getByLabel(/^Giờ bắt đầu/).fill('20:00');
    await rec.getByLabel(/^Giờ kết thúc/).fill('21:30');
    await expect(rec.getByRole('button', { name: 'Tạo', exact: true })).toBeDisabled(); // stale until re-checked
    await rec.getByRole('button', { name: 'Kiểm tra xung đột' }).click();
    await expect(rec.getByText('Không có xung đột lịch.')).toBeVisible({ timeout: 10_000 });
    await expect(rec.getByRole('button', { name: 'Tạo', exact: true })).toBeEnabled();
    await rec.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(page.getByText(`Đã tạo ${n} buổi học`)).toBeVisible({ timeout: 10_000 });
    await expect(sched).toBeHidden();

    // --- Read back through the API.
    const created = (await (await staffApi.get('sessions', { params: { classId: cls!.id, ...CLASS_RANGE } })).json()) as Paged<{ teacherId: string; startAt: string; endAt: string }>;
    expect(created.data.length).toBe(n);
    expect(created.data.every((s) => s.teacherId === teacher2.id && s.startAt.includes('T13:00:00') && s.endAt.includes('T14:30:00'))).toBe(true);

    // --- FR-SCH-07: teacher2 (mobile) sees the class in the week of the first session.
    const tctx = await newClockedContext(browser, mobile);
    extraContexts.push(tctx);
    const tpage = await tctx.newPage();
    await loginAs(tpage, ACCOUNTS.teacher2);
    await tpage.goto('/schedule?date=2026-11-03');
    await expect(tpage.getByRole('heading', { level: 1, name: 'Lịch học' })).toBeVisible({ timeout: 10_000 });
    await expect(tpage.getByText(new RegExp(classCode, 'i')).first()).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(tpage);

    const mine = (await (await teacherApi.get('sessions', { params: { classId: cls!.id, ...CLASS_RANGE } })).json()) as Paged<unknown>;
    expect(mine.data.length).toBe(n);
  } finally {
    for (const c of extraContexts) await c.close();
    await teacherApi.dispose();
    await staffApi.dispose();
  }
});
