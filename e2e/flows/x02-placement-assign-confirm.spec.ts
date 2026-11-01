import { ACCOUNTS } from '../fixtures/accounts';
import { apiAs } from '../fixtures/api';
import { changePasswordFirstLogin, loginAs } from '../fixtures/auth';
import { expect, expectNoHorizontalScroll, mobile, newClockedContext, test } from '../fixtures/clock';
import { runId, uniquePhone } from '../fixtures/ids';

interface Page<T> {
  data: T[];
}

test('FR-PLT-01 FR-PLT-03 FR-PLT-04 FR-CLS-06 FR-CLS-07 kiểm tra đầu vào → GV chấm → xếp lớp từ danh sách chờ → HV xác nhận lớp', async ({ page, browser }) => {
  const studentName = `HV X02 ${runId}`;
  const classCode = `X02-${runId}`.toUpperCase();
  const staffApi = await apiAs(ACCOUNTS.staff1);
  let testId = '';
  let enrollmentId = '';
  let studentCode = '';
  let tempPassword = '';
  const extraContexts = [];
  try {
    // --- Preconditions via API: lead → profile (PENDING_PLACEMENT enrollment) and a PLANNED class with seats.
    const courses = (await (await staffApi.get('courses', { params: { limit: 100 } })).json()) as Page<{ id: string; name: string; code: string }>;
    const course = courses.data.find((c) => c.code === 'ENG-GT');
    expect(course, 'seeded course ENG-GT').toBeTruthy();
    const courseId = course!.id;
    const teacherOf = async (acc: { username: string; password: string }) => {
      const ctx = await apiAs(acc);
      try {
        return ((await (await ctx.get('auth/me')).json()) as { data: { id: string; fullName: string } }).data;
      } finally {
        await ctx.dispose();
      }
    };
    const teacher1 = await teacherOf(ACCOUNTS.teacher1);
    const teacher3 = await teacherOf(ACCOUNTS.teacher3);

    const clsRes = await staffApi.post('classes', {
      data: {
        code: classCode,
        name: `Lớp X02 ${runId}`,
        courseId,
        level: 'A2',
        teacherId: teacher1.id,
        maxCapacity: 10,
        startDate: '2026-12-07',
        endDate: '2027-03-07',
      },
    });
    expect(clsRes.status(), await clsRes.text()).toBe(201);
    const cls = ((await clsRes.json()) as { data: { id: string; status: string } }).data;
    expect(cls.status).toBe('PLANNED');

    const leadRes = await staffApi.post('leads', {
      data: { fullName: studentName, dob: '2001-04-05', gender: 'FEMALE', phone: uniquePhone(), interestedCourseId: courseId },
    });
    expect(leadRes.status(), await leadRes.text()).toBe(201);
    const lead = ((await leadRes.json()) as { data: { id: string } }).data;
    const convRes = await staffApi.post(`leads/${lead.id}/convert`);
    expect(convRes.status(), await convRes.text()).toBe(201);
    const conv = ((await convRes.json()) as { data: { student: { id: string; code: string }; tempPassword: string; enrollmentId: string } }).data;
    studentCode = conv.student.code;
    tempPassword = conv.tempPassword;
    enrollmentId = conv.enrollmentId;

    // --- Staff (desktop UI): create the placement test for tomorrow with teacher3, add the student.
    await loginAs(page, ACCOUNTS.staff1);
    await page.goto('/admissions/placement');
    await expect(page.getByRole('heading', { level: 1, name: 'Kiểm tra đầu vào' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Tạo đợt' }).click();
    const form = page.getByRole('dialog', { name: 'Tạo đợt kiểm tra' });
    await expect(form).toBeVisible();
    await form.getByRole('combobox', { name: /^Khóa học/ }).click();
    await page.getByRole('option', { name: course!.name }).click();
    await form.getByRole('combobox', { name: /^Phòng thi/ }).click();
    await page.getByRole('option').first().click();
    await form.getByRole('combobox', { name: /^Giáo viên chấm/ }).click();
    await page.getByRole('option', { name: teacher3.fullName, exact: true }).click();
    await form.getByRole('button', { name: /Ngày thi/ }).click();
    await page.getByRole('gridcell').filter({ hasText: /^3$/ }).first().getByRole('button').click();
    await form.getByLabel(/^Giờ bắt đầu/).fill('07:00');
    await form.getByLabel(/^Giờ kết thúc/).fill('08:30');
    await form.getByRole('button', { name: 'Tạo đợt' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });

    const tests = (await (await staffApi.get('placement-tests', { params: { courseId, status: 'SCHEDULED', limit: 100 } })).json()) as Page<{ id: string; teacherId: string; startAt: string }>;
    const created = tests.data.filter((x) => x.startAt.startsWith('2026-11-02T') || x.startAt.startsWith('2026-11-03T'));
    const mine = created.find((x) => x.teacherId === teacher3.id);
    expect(mine, 'placement test of teacher3 created through the UI for 2026-11-03').toBeTruthy();
    testId = mine!.id;

    await page.goto(`/admissions/placement/${testId}`);
    await page.getByRole('button', { name: 'Thêm thí sinh' }).click();
    const cand = page.getByRole('dialog', { name: 'Thêm thí sinh' });
    await cand.getByRole('checkbox', { name: studentName }).click();
    await cand.getByRole('button', { name: 'Thêm vào đợt' }).click();
    await expect(page.getByRole('cell', { name: studentName })).toBeVisible({ timeout: 10_000 });

    // --- Teacher3 (mobile) grades: 6.5 + level A2.
    const tctx = await newClockedContext(browser, mobile);
    extraContexts.push(tctx);
    const tpage = await tctx.newPage();
    await loginAs(tpage, ACCOUNTS.teacher3);
    await tpage.goto(`/admissions/placement/${testId}/grade`);
    await expect(tpage.getByRole('heading', { level: 1, name: 'Chấm kiểm tra' })).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(tpage);
    await tpage.getByLabel(`Điểm ${studentName}`).fill('6.5');
    await tpage.getByLabel(`Trình độ ${studentName}`).fill('A2');
    await tpage.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(tpage.getByText('Đã lưu kết quả')).toBeVisible();

    // --- Staff: waiting list → assign into the new class.
    await page.goto('/enrollments/waiting');
    await expect(page.getByRole('heading', { level: 1, name: 'Xếp lớp' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: `Xếp lớp cho ${studentName}` }).click();
    const assign = page.getByRole('dialog', { name: `Xếp lớp cho ${studentName}` });
    await assign.getByRole('radio', { name: new RegExp(classCode) }).check();
    await assign.getByRole('button', { name: 'Xếp vào lớp' }).click();
    await expect(page.getByText(`Đã xếp ${studentName} vào lớp`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: `Xếp lớp cho ${studentName}` })).toHaveCount(0);

    // --- Student (mobile): first login, confirm banner, real click.
    const sctx = await newClockedContext(browser, mobile);
    extraContexts.push(sctx);
    const spage = await sctx.newPage();
    await loginAs(spage, { username: studentCode, password: tempPassword });
    await changePasswordFirstLogin(spage, tempPassword, 'Newpass123');
    await expect(spage.getByRole('heading', { level: 1, name: 'Trang của tôi' })).toBeVisible({ timeout: 10_000 });
    const banner = spage.getByRole('region', { name: 'Xác nhận lớp' });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(`Lớp X02 ${runId}`);
    await expectNoHorizontalScroll(spage);
    await banner.getByRole('button', { name: 'Xác nhận lớp' }).click();
    await expect(banner).toBeHidden({ timeout: 10_000 });

    // --- Read back.
    const res = await staffApi.get('enrollments', { params: { studentId: conv.student.id, classId: cls.id, limit: 100 } });
    expect(res.status()).toBe(200);
    const rows = ((await res.json()) as Page<{ id: string; status: string; confirmedAt: string | null }>).data;
    const row = rows.find((r) => r.id === enrollmentId);
    expect(row, 'enrollment in the new class').toBeTruthy();
    expect(row!.status).toBe('ENROLLED');
    expect(row!.confirmedAt).not.toBeNull();
  } finally {
    for (const c of extraContexts) await c.close();
    await staffApi.dispose();
  }
});
