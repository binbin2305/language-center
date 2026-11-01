import { readFile } from 'node:fs/promises';
import { ACCOUNTS, DEMO_TODAY } from '../fixtures/accounts';
import { apiAs } from '../fixtures/api';
import { loginAs } from '../fixtures/auth';
import { expect, newClockedContext, test } from '../fixtures/clock';
import { runId, uniquePhone } from '../fixtures/ids';

/** Same output as formatVnd from @lc/shared (e2e has no workspace dependency on it): "1.350.000 ₫". */
const formatVnd = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;

interface Invoice {
  id: string;
  code: string;
  status: string;
  amountDue: number;
  finalAmount: number;
  amountPaid: number;
  balance: number;
  discount: { status: string; amount: number; value: number; reason: string } | null;
}

test('FR-FEE-03 FR-FEE-04 FR-RPT-04 FR-RPT-05 đề xuất giảm giá → quản lý duyệt → thu 2 lần → PAID → báo cáo tài chính và xuất Excel', async ({ page, browser }) => {
  const staffApi = await apiAs(ACCOUNTS.staff1);
  const managerApi = await apiAs(ACCOUNTS.manager);
  const extra = [];
  try {
    // --- Preconditions via API: new student assigned to a class → UNPAID invoice.
    const courses = (await (await staffApi.get('courses', { params: { limit: 100 } })).json()) as { data: { id: string; code: string; baseFee: number }[] };
    const course = courses.data.find((c) => c.code === 'ENG-GT');
    expect(course, 'seeded course ENG-GT').toBeTruthy();
    const baseFee = course!.baseFee;
    const discount = Math.round((baseFee * 10) / 100);
    const finalAmount = baseFee - discount;
    const first = Math.floor(finalAmount / 2);
    const second = finalAmount - first;

    const teacherApi = await apiAs(ACCOUNTS.teacher1);
    const me = ((await (await teacherApi.get('auth/me')).json()) as { data: { id: string } }).data;
    await teacherApi.dispose();
    const clsRes = await staffApi.post('classes', {
      data: { code: `X06-${runId}`.toUpperCase(), name: `Lớp X06 ${runId}`, courseId: course!.id, level: 'A2', teacherId: me.id, maxCapacity: 10, startDate: '2026-12-07', endDate: '2027-03-07' },
    });
    expect(clsRes.status(), await clsRes.text()).toBe(201);
    const cls = ((await clsRes.json()) as { data: { id: string } }).data;

    const studentName = `HV X06 ${runId}`;
    const leadRes = await staffApi.post('leads', { data: { fullName: studentName, dob: '2001-04-05', gender: 'FEMALE', phone: uniquePhone(), interestedCourseId: course!.id } });
    expect(leadRes.status(), await leadRes.text()).toBe(201);
    const lead = ((await leadRes.json()) as { data: { id: string } }).data;
    const conv = ((await (await staffApi.post(`leads/${lead.id}/convert`)).json()) as { data: { student: { id: string }; enrollmentId: string } }).data;
    const skip = await staffApi.post(`enrollments/${conv.enrollmentId}/skip-placement`, { data: { level: 'A2', reason: 'Học viên cũ X06' } });
    expect(skip.status(), await skip.text()).toBe(201);
    const asg = await staffApi.post(`enrollments/${conv.enrollmentId}/assign`, { data: { classId: cls.id } });
    expect(asg.status(), await asg.text()).toBe(201);

    const readInvoice = async (): Promise<Invoice> => {
      const list = (await (await staffApi.get('invoices', { params: { studentId: conv.student.id, limit: 100 } })).json()) as { data: Invoice[] };
      expect(list.data).toHaveLength(1);
      return list.data[0]!;
    };
    const inv0 = await readInvoice();
    expect(inv0).toMatchObject({ status: 'UNPAID', amountDue: baseFee, amountPaid: 0 });
    const url = `/fees/invoices/${inv0.id}`;

    // --- Staff proposes 10% "Học bổng".
    await loginAs(page, ACCOUNTS.staff1);
    await page.goto(url);
    await page.getByRole('button', { name: 'Đề xuất giảm giá' }).click();
    const dc = page.getByRole('dialog', { name: 'Đề xuất giảm giá' });
    await dc.getByLabel('Giá trị').fill('10');
    await dc.getByLabel('Lý do').fill('Học bổng');
    await dc.getByRole('button', { name: 'Gửi đề xuất' }).click();
    await expect(page.getByText('Đã gửi đề xuất giảm giá')).toBeVisible();
    const pending = await readInvoice();
    expect(pending.discount).toMatchObject({ status: 'PENDING_APPROVAL', value: 10, reason: 'Học bổng' });
    expect(pending.finalAmount, 'not applied before approval').toBe(baseFee);

    // --- Manager approves from the invoice page.
    const mctx = await newClockedContext(browser);
    extra.push(mctx);
    const mpage = await mctx.newPage();
    await loginAs(mpage, ACCOUNTS.manager);
    await mpage.goto(url);
    const discSection = mpage.getByRole('region', { name: 'Giảm giá' });
    await expect(discSection).toBeVisible({ timeout: 10_000 });
    await discSection.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(mpage.getByText('Đã duyệt giảm giá')).toBeVisible();
    const approved = await readInvoice();
    expect(approved.discount?.status).toBe('APPROVED');
    expect(approved.finalAmount).toBe(finalAmount);
    await expect(mpage.getByText(formatVnd(finalAmount)).first()).toBeVisible();

    // --- Staff pays half (CASH) → PARTIAL, then the rest (BANK_TRANSFER) → PAID.
    await page.reload();
    await page.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    let pay = page.getByRole('dialog', { name: 'Ghi nhận thanh toán' });
    await pay.getByLabel('Số tiền').fill(String(first));
    await pay.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
    await expect(page.getByText('Đã ghi nhận thanh toán')).toBeVisible();
    const partial = await readInvoice();
    expect(partial).toMatchObject({ status: 'PARTIAL', amountPaid: first, balance: finalAmount - first });

    await page.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    pay = page.getByRole('dialog', { name: 'Ghi nhận thanh toán' });
    await expect(pay.getByLabel('Số tiền')).toHaveValue(formatVnd(second).replace(/\s*₫/, ''));
    await pay.getByRole('combobox', { name: 'Hình thức' }).click();
    await page.getByRole('option', { name: 'Chuyển khoản' }).click();
    await pay.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
    await expect(page.getByText('Đã ghi nhận thanh toán').first()).toBeVisible();
    const paid = await readInvoice();
    expect(paid).toMatchObject({ status: 'PAID', amountPaid: finalAmount, balance: 0 });
    await expect(page.getByText('Còn nợ').locator('xpath=following-sibling::dd')).toHaveText(formatVnd(0));
    const history = page.getByLabel('Lịch sử thanh toán');
    await expect(history.getByText('Chuyển khoản', { exact: true })).toBeVisible();
    await expect(history.getByText('Tiền mặt', { exact: true })).toBeVisible();

    // --- Manager finance report for DEMO_TODAY..DEMO_TODAY.
    await mpage.goto('/reports');
    await mpage.getByRole('tab', { name: 'Tài chính' }).click();
    await mpage.getByRole('button', { name: 'Tùy chọn' }).click();
    await mpage.getByLabel('Từ ngày').fill(DEMO_TODAY);
    await mpage.getByLabel('Đến ngày').fill(DEMO_TODAY);
    const card = mpage.locator('div').filter({ hasText: /^Doanh thu/ }).last();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const rep = (await (await managerApi.get('reports/finance', { params: { from: DEMO_TODAY, to: DEMO_TODAY, groupBy: 'month' } })).json()) as { data: { totals: { revenue: number } } };
    expect(rep.data.totals.revenue).toBeGreaterThanOrEqual(first + second);
    await expect(card).toContainText(formatVnd(rep.data.totals.revenue));

    // --- Excel export: real click, real download.
    const [download] = await Promise.all([mpage.waitForEvent('download'), mpage.getByRole('button', { name: 'Xuất Excel' }).click()]);
    expect(download.suggestedFilename()).toBe(`bao-cao-finance-${DEMO_TODAY}_${DEMO_TODAY}.xlsx`);
    const buf = await readFile(await download.path());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1024);
  } finally {
    for (const c of extra) await c.close();
    await staffApi.dispose();
    await managerApi.dispose();
  }
});
