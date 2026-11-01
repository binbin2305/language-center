import { expect, type Page } from '@playwright/test';

/**
 * Logs in through the real /login form (D31, no storageState) and resolves once the landing page's h1 is
 * visible: the role's home, or "Đổi mật khẩu" for an account with mustChangePassword.
 * `opts.expectHome` additionally asserts that h1's text (e.g. 'Tổng quan', /Hôm nay/).
 */
export async function loginAs(
  page: Page,
  acc: { username: string; password: string },
  opts: { expectHome?: string | RegExp } = {},
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email hoặc mã học viên').fill(acc.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(acc.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
  const h1 = page.getByRole('heading', { level: 1 }).first();
  await expect(h1).toBeVisible({ timeout: 15_000 });
  await expect(h1).not.toHaveText('Đăng nhập');
  if (opts.expectHome !== undefined) await expect(h1).toHaveText(opts.expectHome);
}

/** On /change-password after a first login: sets the new password and waits for the role's home. */
export async function changePasswordFirstLogin(page: Page, oldPw: string, newPw: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Đổi mật khẩu' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(oldPw);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(newPw);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(newPw);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(page).not.toHaveURL(/\/change-password/, { timeout: 15_000 });
  const h1 = page.getByRole('heading', { level: 1 }).first();
  await expect(h1).toBeVisible({ timeout: 15_000 });
  await expect(h1).not.toHaveText('Đổi mật khẩu');
}
