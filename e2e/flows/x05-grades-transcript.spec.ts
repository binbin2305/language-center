import { readFile } from 'node:fs/promises';
import type { APIRequestContext } from '@playwright/test';
import { ACCOUNTS, DEMO_TODAY, type Account } from '../fixtures/accounts';
import { apiAs } from '../fixtures/api';
import { loginAs } from '../fixtures/auth';
import { expect, mobile, newClockedContext, test } from '../fixtures/clock';
import { runId } from '../fixtures/ids';

interface ClassRow {
  id: string;
  code: string;
  name: string;
  status: string;
  teacherId: string;
}
interface AssessmentRow {
  id: string;
  name: string;
  weight: number;
  confirmedAt: string | null;
}
interface GradeRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  score: number | null;
  left: boolean;
}
interface ResultItem {
  assessmentId: string;
  name: string;
  score: number | null;
}
interface Result {
  classId: string;
  items: ResultItem[];
  average: number | null;
}

const WEIGHT = 10;
const TEACHERS: Account[] = [ACCOUNTS.teacher1, ACCOUNTS.teacher2, ACCOUNTS.teacher3, ACCOUNTS.teacher4, ACCOUNTS.teacher5];

const json = async <T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> => {
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { data: T }).data;
};

/** Seeded ONGOING class taught by a seeded teacher whose remaining weight allows a QUIZ of WEIGHT (asserted). */
async function findClassWithRoom(): Promise<{ account: Account; cls: ClassRow; remaining: number }> {
  const staff = await apiAs(ACCOUNTS.staff1);
  try {
    const classes = await json<ClassRow[]>(await staff.get('classes', { params: { status: 'ONGOING', limit: 100 } }));
    for (const account of TEACHERS) {
      const t = await apiAs(account);
      try {
        const me = await json<{ id: string }>(await t.get('auth/me'));
        for (const cls of classes.filter((c) => c.teacherId === me.id && c.status === 'ONGOING')) {
          const used = (await json<AssessmentRow[]>(await staff.get(`classes/${cls.id}/assessments`))).reduce((s, a) => s + a.weight, 0);
          if (100 - used >= WEIGHT) return { account, cls, remaining: 100 - used };
        }
      } finally {
        await t.dispose();
      }
    }
  } finally {
    await staff.dispose();
  }
  throw new Error(`no seeded ONGOING class has >= ${WEIGHT} weight left`);
}

test('FR-GRD-01 FR-GRD-03 FR-GRD-06 FR-GRD-08 GV tạo bài, lưu nháp, xác nhận → HV chỉ thấy sau xác nhận và tải phiếu điểm PDF', async ({ page, browser }) => {
  const name = `Quiz X05 ${runId}`;
  const { account, cls, remaining } = await findClassWithRoom();
  expect(remaining, 'precondition: class has room for a QUIZ of weight 10').toBeGreaterThanOrEqual(WEIGHT);
  const teacherApi = await apiAs(account);
  const extra = [];
  try {
    // --- Teacher creates the assessment from the class page.
    await loginAs(page, account);
    await page.goto(`/classes/${cls.id}?tab=assessments`);
    await expect(page.getByRole('button', { name: 'Thêm bài đánh giá' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Thêm bài đánh giá' }).click();
    const dlg = page.getByRole('dialog', { name: 'Thêm bài đánh giá' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel(/^Tên bài/).fill(name);
    await dlg.getByLabel(/^Trọng số/).fill(String(WEIGHT));
    await dlg.getByLabel(/^Ngày kiểm tra/).fill(DEMO_TODAY);
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('Đã tạo bài đánh giá')).toBeVisible();

    const created = (await json<AssessmentRow[]>(await teacherApi.get(`classes/${cls.id}/assessments`))).find((a) => a.name === name);
    expect(created, 'assessment created').toBeTruthy();
    expect(created).toMatchObject({ weight: WEIGHT, confirmedAt: null });
    const aId = created!.id;

    // --- Pick the viewing student: in the first (draft) half and allowed to view results (W2 resultViewRequiresPaidFees → FEES_OUTSTANDING otherwise).
    const rows = (await json<{ rows: GradeRow[] }>(await teacherApi.get(`assessments/${aId}/grades`))).rows.filter((r) => !r.left);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const half = Math.ceil(rows.length / 2);
    let viewer: GradeRow | undefined;
    for (const r of rows.slice(0, half)) {
      const s = await apiAs({ username: r.studentCode, password: 'Password1' });
      try {
        if ((await s.get('results', { params: { studentId: r.studentId, limit: 100 } })).status() === 200) {
          viewer = r;
          break;
        }
      } finally {
        await s.dispose();
      }
    }
    expect(viewer, 'a student in the draft half whose fees do not block /results (FR-GRD-07 gate)').toBeTruthy();
    const scoreOf = (r: GradeRow): string => (r.studentId === viewer!.studentId ? '8.5' : String(6 + (rows.indexOf(r) % 4) * 0.5));

    // --- Draft: score the first half only.
    await page.goto(`/assessments/${aId}/grades`);
    await expect(page.getByRole('button', { name: 'Lưu nháp' })).toBeVisible({ timeout: 10_000 });
    for (const r of rows.slice(0, half)) await page.getByLabel(`Điểm ${r.studentName}`, { exact: true }).fill(scoreOf(r));
    await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByText('Đã lưu nháp')).toBeVisible();
    const afterDraft = await json<{ assessment: AssessmentRow }>(await teacherApi.get(`assessments/${aId}/grades`));
    expect(afterDraft.assessment.confirmedAt).toBeNull();

    // --- Student: results do not include the draft assessment.
    const ctx = await newClockedContext(browser, mobile);
    extra.push(ctx);
    const sp = await ctx.newPage();
    await loginAs(sp, { username: viewer!.studentCode, password: 'Password1' });
    await sp.goto('/me/results');
    await expect(sp.getByRole('heading', { level: 1, name: 'Kết quả của tôi' })).toBeVisible({ timeout: 10_000 });
    await expect(sp.getByRole('heading', { level: 2 }).first().or(sp.getByText('Chưa có kết quả học tập'))).toBeVisible({ timeout: 10_000 });
    await expect(sp.getByText(name)).toHaveCount(0);
    const studentApi = await apiAs({ username: viewer!.studentCode, password: 'Password1' });
    try {
      const draftRes = await json<Result[]>(await studentApi.get('results', { params: { studentId: viewer!.studentId, limit: 100 } }));
      expect(draftRes.flatMap((r) => r.items).some((i) => i.assessmentId === aId), 'draft hidden from student API').toBe(false);

      // --- Teacher completes the sheet and confirms (all scored → no "missing" dialog).
      for (const r of rows.slice(half)) await page.getByLabel(`Điểm ${r.studentName}`, { exact: true }).fill(scoreOf(r));
      await page.getByRole('button', { name: 'Xác nhận kết quả', exact: true }).click();
      await expect(page.getByText('Đã xác nhận kết quả')).toBeVisible();
      const confirmed = await json<{ assessment: AssessmentRow; rows: GradeRow[] }>(await teacherApi.get(`assessments/${aId}/grades`));
      expect(confirmed.assessment.confirmedAt).not.toBeNull();
      expect(confirmed.rows.filter((r) => r.score === null && !r.left)).toHaveLength(0);

      // --- Student sees the score and the average.
      await sp.reload();
      const card = sp.locator('section').filter({ has: sp.getByRole('heading', { level: 2, name: cls.name }) }).filter({ has: sp.getByRole('button', { name: 'Tải phiếu điểm PDF' }) }).last(); // innermost: the page <section> wraps the card
      await expect(card).toBeVisible({ timeout: 10_000 });
      const row = card.getByRole('row').filter({ hasText: name });
      await expect(row).toBeVisible();
      await expect(row).toContainText(`${WEIGHT}%`);
      await expect(row).toContainText('8,5');
      const apiRes = (await json<Result[]>(await studentApi.get('results', { params: { studentId: viewer!.studentId, limit: 100 } }))).find((r) => r.classId === cls.id)!;
      expect(apiRes.items.find((i) => i.assessmentId === aId)?.score).toBe(8.5);
      expect(apiRes.average, 'average computed').not.toBeNull();
      await expect(card.getByText('Trung bình')).toBeVisible();

      // --- Transcript PDF download.
      const [download] = await Promise.all([sp.waitForEvent('download'), card.getByRole('button', { name: 'Tải phiếu điểm PDF' }).click()]);
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      const path = await download.path();
      const buf = await readFile(path);
      expect(buf.length).toBeGreaterThan(1024);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await studentApi.dispose();
    }
  } finally {
    for (const c of extra) await c.close();
    await teacherApi.dispose();
  }
});
