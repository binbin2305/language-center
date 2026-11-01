import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../../../test/msw/server';
import { renderApp, renderWithProviders } from '../../../../test/render';
import { makeUser } from '../../../../test/users';
import StudentResultsTab from '../components/student-results-tab';

const CLASS_ID = '65000000000000000000c001';
const COURSE_ID = '65000000000000000000d001';
const S1 = '65000000000000000000b001';
const S2 = '65000000000000000000b002';
const WAIT = { timeout: 10_000 };
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

const result = (studentId: string, name: string, over: Record<string, unknown> = {}) => ({
  studentId,
  studentName: name,
  classId: CLASS_ID,
  courseId: COURSE_ID,
  items: [
    { assessmentId: 'a1', name: 'Giữa kỳ', type: 'MIDTERM', weight: 40, score: 8 },
    { assessmentId: 'a2', name: 'Cuối kỳ', type: 'FINAL', weight: 60, score: null },
  ],
  average: 8.5,
  gradeClass: 'GOOD',
  passed: true,
  ...over,
});
const page = (rows: unknown[]) => ({ data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 } });
const classesPage = () =>
  HttpResponse.json(page([{ id: CLASS_ID, code: 'L1', name: 'IELTS A1', courseId: COURSE_ID, level: 'A1', status: 'ONGOING' }]));

describe('/results', () => {
  it('lọc lớp → GET /results?classId=…, bảng HV × bài + TB + badge xếp loại (FR-GRD-05)', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/api/v1/classes', classesPage),
      http.get('*/api/v1/results', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(page([result(S1, 'Nguyễn An'), result(S2, 'Trần Bình', { average: 4, gradeClass: 'FAIL', passed: false })]));
      }),
    );
    renderApp({ route: '/results', user: makeUser('ACADEMIC_STAFF') });
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Kết quả học tập' }, WAIT)).toBeInTheDocument();
    await user.click(await screen.findByRole('combobox', { name: 'Lớp' }));
    await user.click(await screen.findByRole('option', { name: /IELTS A1/ }));
    expect(await screen.findByText('Nguyễn An', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Giữa kỳ/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Cuối kỳ/ })).toBeInTheDocument();
    expect(screen.getByText('Giỏi')).toBeInTheDocument();
    expect(screen.getByText('Không đạt')).toBeInTheDocument();
    expect(screen.getByText('8,5')).toBeInTheDocument();
    await waitFor(() => expect(seen.some((s) => s.includes(`classId=${CLASS_ID}`))).toBe(true));
  });

  it('lọc khóa → courseId, lọc HV (ô tìm) → studentId (FR-GRD-05)', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/api/v1/classes', classesPage),
      http.get('*/api/v1/courses', () => HttpResponse.json(page([{ id: COURSE_ID, code: 'IELTS', name: 'IELTS Foundation' }]))),
      http.get('*/api/v1/students', () => HttpResponse.json(page([{ id: S2, code: 'HV0002', fullName: 'Trần Bình' }]))),
      http.get('*/api/v1/results', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(page([result(S1, 'Nguyễn An')]));
      }),
    );
    renderApp({ route: '/results', user: makeUser('ACADEMIC_STAFF') });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: 'Khóa học' }, WAIT));
    await user.click(await screen.findByRole('option', { name: /IELTS Foundation/ }));
    await waitFor(() => expect(seen.some((s) => s.includes(`courseId=${COURSE_ID}`))).toBe(true));
    await user.click(screen.getByRole('combobox', { name: 'Học viên' }));
    await user.click(await screen.findByRole('option', { name: /Trần Bình/ }));
    await waitFor(() => expect(seen.some((s) => s.includes(`studentId=${S2}`) && s.includes(`courseId=${COURSE_ID}`))).toBe(true));
  });

  it('cột "Lớp" phân biệt hai dòng cùng HV ở hai lớp (mã - tên lớp)', async () => {
    server.use(
      http.get('*/api/v1/classes', classesPage),
      http.get('*/api/v1/results', () =>
        HttpResponse.json(
          page([
            result(S1, 'Nguyễn An', { classCode: 'L1', className: 'IELTS A1' }),
            result(S1, 'Nguyễn An', { classId: '65000000000000000000c002', classCode: 'L2', className: 'IELTS A2' }),
          ]),
        ),
      ),
    );
    renderApp({ route: '/results', user: makeUser('ACADEMIC_STAFF') });
    expect(await screen.findByRole('columnheader', { name: 'Lớp' }, WAIT)).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'L1 - IELTS A1' }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'L2 - IELTS A2' })).toBeInTheDocument();
  });

  it('rỗng → "Chưa có kết quả học tập"', async () => {
    server.use(http.get('*/api/v1/results', () => HttpResponse.json(page([]))));
    renderApp({ route: '/results', user: makeUser('MANAGER') });
    expect(await screen.findByText('Chưa có kết quả học tập', {}, WAIT)).toBeInTheDocument();
  });
});

describe('/me/results', () => {
  const me = () => makeUser('STUDENT', { studentId: S1 });

  it('thẻ theo lớp; "Tải phiếu điểm PDF" gọi results/transcript.pdf?studentId&classId', async () => {
    const user0 = me();
    let url = '';
    server.use(
      http.get('*/api/v1/classes/:id', () =>
        HttpResponse.json({ data: { id: CLASS_ID, code: 'L1', name: 'IELTS A1', courseId: COURSE_ID } }),
      ),
      http.get('*/api/v1/results', () => HttpResponse.json(page([result(S1, 'Tôi')]))),
      http.get('*/api/v1/results/transcript.pdf', ({ request }) => {
        url = new URL(request.url).search;
        return new HttpResponse(new Blob(['%PDF']), { headers: { 'Content-Type': 'application/pdf' } });
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    renderApp({ route: '/me/results', user: user0 });
    const user = userEvent.setup();
    expect(await screen.findByText('Giỏi', {}, WAIT)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tải phiếu điểm PDF' }));
    await waitFor(() => expect(url).toContain(`classId=${CLASS_ID}`));
    expect(url).toContain('studentId=');
  });

  it('403 FEES_OUTSTANDING → khối cảnh báo + hướng dẫn liên hệ, không có bảng', async () => {
    server.use(
      http.get('*/api/v1/results', () =>
        HttpResponse.json({ error: { code: 'FEES_OUTSTANDING', message: 'x' } }, { status: 403 }),
      ),
    );
    renderApp({ route: '/me/results', user: me() });
    expect(await screen.findByText(/Bạn còn học phí quá hạn/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/liên hệ/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('rỗng → "Chưa có kết quả học tập"', async () => {
    server.use(http.get('*/api/v1/results', () => HttpResponse.json(page([]))));
    renderApp({ route: '/me/results', user: me() });
    expect(await screen.findByText('Chưa có kết quả học tập', {}, WAIT)).toBeInTheDocument();
  });
});

describe('tab Kết quả của học viên', () => {
  it('đọc id từ route, GET /results?studentId=… và hiện điểm', async () => {
    let search = '';
    server.use(
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: { id: CLASS_ID, name: 'IELTS A1' } })),
      http.get('*/api/v1/results', ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(page([result(S1, 'Nguyễn An')]));
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/students/:id" element={<StudentResultsTab />} />
      </Routes>,
      { route: `/students/${S1}`, user: makeUser('ACADEMIC_STAFF') },
    );
    const card = (await screen.findAllByText('Giữa kỳ', {}, WAIT))[0]!;
    expect(within(card.closest('table') as HTMLElement).getByText('8')).toBeInTheDocument();
    expect(search).toContain(`studentId=${S1}`);
  });
});
