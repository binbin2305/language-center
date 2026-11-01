import type { Page } from '@playwright/test';
import { ACCOUNTS } from '../fixtures/accounts';
import { apiAs } from '../fixtures/api';
import { changePasswordFirstLogin, loginAs } from '../fixtures/auth';
import { expect, test } from '../fixtures/clock';
import { runId, uniquePhone } from '../fixtures/ids';

async function fillLeadForm(page: Page, fullName: string, phone: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Tiếp nhận lead' })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Họ và tên').fill(fullName);
  await page.getByRole('button', { name: /Ngày sinh/ }).click();
  await page.getByRole('gridcell').filter({ hasNotText: /^$/ }).first().getByRole('button').click();
  await page.getByRole('combobox', { name: 'Giới tính *' }).click();
  await page.getByRole('option', { name: 'Nam' }).click();
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByRole('combobox', { name: 'Khóa học quan tâm *' }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Lưu lead' }).click();
}

test('FR-ADM-01 FR-ADM-02 FR-ADM-03 FR-ADM-04 FR-AUTH-02 NVHV tiếp nhận → trùng → hồ sơ → HV đăng nhập lần đầu', async ({ page }) => {
  const phone = uniquePhone();
  const name1 = `Lead E2E ${runId}`;
  const name2 = `Lead Trung ${runId}`;

  await loginAs(page, ACCOUNTS.staff1);
  await page.goto('/admissions/leads/new');
  await fillLeadForm(page, name1, phone);
  await expect(page.getByRole('heading', { level: 1, name: name1 })).toBeVisible({ timeout: 10_000 });
  const leadUrl = page.url();

  // Second lead with the same phone → duplicate warning listing lead #1.
  await page.goto('/admissions/leads/new');
  await fillLeadForm(page, name2, phone);
  const dup = page.getByRole('dialog', { name: 'Có thể đã tồn tại' });
  await expect(dup).toBeVisible();
  await expect(dup.getByText(name1)).toBeVisible();
  await expect(dup.getByText('Trùng SĐT')).toBeVisible();
  await dup.getByRole('button', { name: 'Quay lại' }).click();
  await expect(dup).toBeHidden();

  // Open lead #1 → create profile.
  await page.goto(leadUrl);
  await expect(page.getByRole('heading', { level: 1, name: name1 })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Tạo hồ sơ học viên' }).click();
  await page.getByRole('dialog', { name: 'Tạo hồ sơ học viên' }).getByRole('button', { name: 'Tạo hồ sơ' }).click();
  const done = page.getByRole('dialog', { name: 'Đã tạo hồ sơ học viên' });
  await expect(done).toBeVisible();
  const code = (await done.locator('dd').first().innerText()).trim();
  const tempPassword = (await done.locator('code').innerText()).trim();
  expect(code).not.toBe('');
  expect(tempPassword.length).toBeGreaterThanOrEqual(8);
  await done.getByRole('button', { name: 'Đóng', exact: true }).click();

  // Log out (staff) and first login as the student.
  await page.getByRole('button', { name: 'Tài khoản của tôi' }).first().click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login/);

  await loginAs(page, { username: code, password: tempPassword });
  await expect(page).toHaveURL(/\/change-password/);
  await changePasswordFirstLogin(page, tempPassword, 'Newpass123');
  await expect(page.getByRole('heading', { level: 1 }).first()).not.toHaveText('Đổi mật khẩu');

  const api = await apiAs(ACCOUNTS.staff1);
  try {
    const res = await api.get('leads', { params: { status: 'PROFILE_CREATED', q: name1 } });
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { fullName: string; phone: string }[] };
    expect(data.map((l) => l.fullName)).toContain(name1);
  } finally {
    await api.dispose();
  }
});
