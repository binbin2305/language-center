import { cloneElement, type ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

// jsdom has no layout: give recharts a fixed-size container so it neither warns about 0x0 nor skips rendering.
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 600, height: 240 } as object),
  };
});

Element.prototype.hasPointerCapture ??= () => false;

const T = { timeout: 10_000 };
const COURSE = '65000000000000000000c001';
const EMPTY = 'Không có dữ liệu thống kê cho khoảng thời gian này';

const admissions = {
  totals: { leads: 10, newProfiles: 4, conversionRate: 0.4, enrolled: 3, waiting: 2 },
  rows: [{ courseId: COURSE, courseName: 'IELTS Foundation', leads: 10, newProfiles: 4, conversionRate: 0.4, enrolled: 3, waiting: 2 }],
};
const finance = {
  totals: { revenue: 5000000, totalDue: 8000000, outstanding: 3000000, overdue: 1000000, totalDiscount: 500000 },
  rows: [{ key: '2026-11', label: 'Tháng 11/2026', revenue: 5000000, totalDue: 8000000, outstanding: 3000000, overdue: 1000000, totalDiscount: 500000 }],
};

/** Records the query string of each GET to the url pattern and answers with `body`. */
function spy(pattern: string, body: unknown) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get(pattern, ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return HttpResponse.json({ data: body });
    }),
  );
  return calls;
}
const open = () => renderApp({ route: '/reports', user: makeUser('MANAGER') });

beforeEach(() => {
  // Date only: timers stay real so MSW / userEvent keep working. 2026-11-18 VN.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T05:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('báo cáo - bộ lọc (FR-RPT-01)', () => {
  it('tab Tuyển sinh mặc định gọi /reports/admissions?from=<đầu tháng>&to=<hôm nay>', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    expect(calls[0].get('from')).toBe('2026-11-01');
    expect(calls[0].get('to')).toBe('2026-11-18');
  });

  it('đổi preset "Quý này" → from = ngày đầu quý', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    await userEvent.click(screen.getByRole('button', { name: 'Quý này' }));
    await waitFor(() => expect(calls.at(-1)!.get('from')).toBe('2026-10-01'));
    expect(calls.at(-1)!.get('to')).toBe('2026-11-18');
    await userEvent.click(screen.getByRole('button', { name: 'Năm nay' }));
    await waitFor(() => expect(calls.at(-1)!.get('from')).toBe('2026-01-01'));
  });

  it('tùy chọn khoảng → gửi đúng from/to', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn' }));
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-03-05' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-04-10' } });
    await waitFor(() => {
      const last = calls.at(-1)!;
      expect([last.get('from'), last.get('to')]).toEqual(['2026-03-05', '2026-04-10']);
    });
  });

  it('lọc khóa thêm courseId', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    server.use(
      http.get('*/api/v1/courses', () =>
        HttpResponse.json({
          data: [{ id: COURSE, code: 'IELTS-F', name: 'IELTS Foundation' }],
          meta: { page: 1, limit: 20, total: 1 },
        }),
      ),
    );
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    expect(calls[0].get('courseId')).toBeNull();
    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo khóa học' }));
    await userEvent.click(await screen.findByRole('option', { name: /IELTS-F/ }, T));
    await waitFor(() => expect(calls.at(-1)!.get('courseId')).toBe(COURSE));
  });

  it('rỗng → thông báo không có dữ liệu', async () => {
    spy('*/api/v1/reports/admissions', {
      totals: { leads: 0, newProfiles: 0, conversionRate: 0, enrolled: 0, waiting: 0 },
      rows: [],
    });
    open();
    expect(await screen.findByText(EMPTY, {}, T)).toBeInTheDocument();
  });

  it('h1 hiển thị cả khi đang tải', () => {
    server.use(http.get('*/api/v1/reports/admissions', () => new Promise(() => {})));
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeInTheDocument();
  });
});

describe('báo cáo - xuất file (FR-RPT-05)', () => {
  it('Xuất Excel / Xuất PDF → tải reports/admissions/export?format=…&from=…&to=…', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    const hits: URLSearchParams[] = [];
    server.use(
      http.get('*/api/v1/reports/admissions/export', ({ request }) => {
        hits.push(new URL(request.url).searchParams);
        return new HttpResponse(new Uint8Array([80, 75]), { headers: { 'Content-Type': 'application/octet-stream' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(hits).toHaveLength(1));
    expect([hits[0].get('format'), hits[0].get('from'), hits[0].get('to')]).toEqual(['xlsx', '2026-11-01', '2026-11-18']);
    await userEvent.click(screen.getByRole('button', { name: 'Xuất PDF' }));
    await waitFor(() => expect(hits).toHaveLength(2));
    expect(hits[1].get('format')).toBe('pdf');
    // Ruling R14: same name as the API's Content-Disposition (bao-cao-<type>-<from>-<to>.<ext>)
    await waitFor(() => expect(names).toEqual(['bao-cao-admissions-2026-11-01-2026-11-18.xlsx', 'bao-cao-admissions-2026-11-01-2026-11-18.pdf']));
  });
});

describe('báo cáo - các tab', () => {
  it('mỗi tab hiển thị bảng', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    spy('*/api/v1/reports/attendance', {
      byClass: [{ classId: 'a', classCode: 'LOP-A1', sessions: 4, records: 40, attendanceRate: 0.9 }],
      byStudent: [],
      overThreshold: [],
    });
    spy('*/api/v1/reports/academic', {
      rows: [{ classId: 'a', courseId: COURSE, teacherId: 't', classCode: 'LOP-H1', teacherName: 'Cô Lan', students: 12, averageScore: 7.5, passRate: 0.8 }],
      distribution: { EXCELLENT: 1, GOOD: 2, FAIR: 3, AVERAGE: 4, FAIL: 5 },
      passRate: 0.8,
      failRate: 0.2,
    });
    spy('*/api/v1/reports/finance', finance);
    open();
    expect(await screen.findByRole('table', {}, T)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Chuyên cần' }));
    expect(await screen.findByRole('cell', { name: 'LOP-A1' }, T)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Học tập' }));
    expect(await screen.findByRole('cell', { name: 'LOP-H1' }, T)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Tài chính' }));
    expect(await screen.findByRole('cell', { name: 'Tháng 11/2026' }, T)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('FR-RPT-02: tab Chuyên cần có bảng "Theo học viên" (Mã HV, Họ tên, Lớp, Số buổi, Vắng, Tỷ lệ chuyên cần)', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    spy('*/api/v1/reports/attendance', {
      byClass: [{ classId: 'a', classCode: 'LOP-A1', sessions: 4, records: 40, attendanceRate: 0.9 }],
      byStudent: [
        { studentId: 's1', studentCode: 'HV202600001', fullName: 'Nguyễn Văn An', classId: 'a', records: 4, absences: 1, attendanceRate: 0.75 },
      ],
      overThreshold: [],
    });
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Chuyên cần' }, T));
    const section = await screen.findByRole('region', { name: 'Theo học viên' }, T);
    const table = within(section).getByRole('table');
    expect(table.closest('.overflow-x-auto')).not.toBeNull();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Mã HV', 'Họ tên', 'Lớp', 'Số buổi', 'Vắng', 'Tỷ lệ chuyên cần',
    ]);
    expect(within(table).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'HV202600001', 'Nguyễn Văn An', 'LOP-A1', '4', '1', '75.0%',
    ]);
  });

  it('FR-RPT-03: tab Học tập — mọi lớp 0 HV có điểm trong khoảng → thông báo không có dữ liệu', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    spy('*/api/v1/reports/academic', {
      rows: [
        { classId: 'a', courseId: COURSE, teacherId: 't', classCode: 'LOP-H1', teacherName: 'Cô Lan', students: 0, averageScore: null, passRate: null },
        { classId: 'b', courseId: COURSE, teacherId: 't', classCode: 'LOP-H2', teacherName: 'Cô Lan', students: 0, averageScore: null, passRate: null },
      ],
      distribution: {},
      passRate: 0,
      failRate: 0,
    });
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Học tập' }, T));
    expect(await screen.findByText(EMPTY, {}, T)).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'LOP-H1' })).toBeNull();
  });

  it('tab Tài chính hiển thị 5 thẻ + biểu đồ', async () => {
    const calls = spy('*/api/v1/reports/finance', finance);
    spy('*/api/v1/reports/admissions', admissions);
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Tài chính' }, T));
    for (const l of ['Doanh thu', 'Tổng phải thu', 'Còn nợ', 'Quá hạn', 'Giảm giá']) {
      expect(await screen.findByTestId(`stat-${l}`, {}, T)).toBeInTheDocument();
    }
    expect(screen.getByRole('img', { name: /Biểu đồ/ })).toBeInTheDocument();
    expect(calls[0].get('groupBy')).toBe('month');
  });
});

const TEACHER = '65000000000000000000d001';
const CLASS = '65000000000000000000e001';
const academicBody = {
  rows: [{ classId: 'a', courseId: COURSE, teacherId: TEACHER, classCode: 'LOP-H1', teacherName: 'Cô Lan', students: 12, averageScore: 7.5, passRate: 0.8 }],
  distribution: { EXCELLENT: 1, GOOD: 2, FAIR: 3, AVERAGE: 4, FAIL: 5 },
  passRate: 0.8,
  failRate: 0.2,
};
const attendanceBody = {
  byClass: [{ classId: CLASS, classCode: 'LOP-A1', sessions: 4, records: 40, attendanceRate: 0.9 }],
  byStudent: [],
  overThreshold: [],
};
const page = (data: unknown[]) => HttpResponse.json({ data, meta: { page: 1, limit: 20, total: data.length } });

describe('báo cáo - bộ lọc bổ sung và bảo vệ (L-03)', () => {
  it('FR-RPT-03 tab Học tập có bộ lọc GV → gửi teacherId', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    const calls = spy('*/api/v1/reports/academic', academicBody);
    server.use(http.get('*/api/v1/teachers', () => page([{ id: TEACHER, code: 'GV001', fullName: 'Cô Lan' }])));
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Học tập' }, T));
    await screen.findByRole('cell', { name: 'LOP-H1' }, T);
    expect(calls[0].get('teacherId')).toBeNull();
    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo giáo viên' }));
    await userEvent.click(await screen.findByRole('option', { name: /Cô Lan/ }, T));
    await waitFor(() => expect(calls.at(-1)!.get('teacherId')).toBe(TEACHER));
  });

  it('FR-RPT-02 lọc lớp → classId', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    const calls = spy('*/api/v1/reports/attendance', attendanceBody);
    server.use(http.get('*/api/v1/classes', () => page([{ id: CLASS, code: 'LOP-A1', name: 'Lớp A1' }])));
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Chuyên cần' }, T));
    await screen.findByRole('cell', { name: 'LOP-A1' }, T);
    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo lớp' }));
    await userEvent.click(await screen.findByRole('option', { name: /LOP-A1/ }, T));
    await waitFor(() => expect(calls.at(-1)!.get('classId')).toBe(CLASS));
  });

  it('FR-RPT-04 chọn nhóm "Theo khóa" → groupBy=course', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    const calls = spy('*/api/v1/reports/finance', finance);
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Tài chính' }, T));
    await screen.findByTestId('stat-Doanh thu', {}, T);
    await userEvent.click(screen.getByRole('combobox', { name: 'Nhóm theo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Theo khóa' }, T));
    await waitFor(() => expect(calls.at(-1)!.get('groupBy')).toBe('course'));
  });

  it('FR-RPT-05 xuất Excel tab Chuyên cần → reports/attendance/export?format=xlsx…', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    spy('*/api/v1/reports/attendance', attendanceBody);
    const hits: URL[] = [];
    server.use(
      http.get('*/api/v1/reports/attendance/export', ({ request }) => {
        hits.push(new URL(request.url));
        return new HttpResponse(new Uint8Array([80, 75]), { headers: { 'Content-Type': 'application/octet-stream' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Chuyên cần' }, T));
    await screen.findByRole('cell', { name: 'LOP-A1' }, T);
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(hits).toHaveLength(1));
    expect(hits[0].pathname).toMatch(/reports\/attendance\/export$/);
    expect([hits[0].searchParams.get('format'), hits[0].searchParams.get('from'), hits[0].searchParams.get('to')]).toEqual(['xlsx', '2026-11-01', '2026-11-18']);
  });

  it('lỗi 500 → thông báo lỗi + nút "Thử lại" gọi lại', async () => {
    let n = 0;
    server.use(
      http.get('*/api/v1/reports/admissions', () => {
        n += 1;
        return n === 1
          ? HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 })
          : HttpResponse.json({ data: admissions });
      }),
    );
    open();
    expect(await screen.findByRole('alert', {}, T)).toHaveTextContent('Không tải được dữ liệu');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('cell', { name: 'IELTS Foundation' }, T)).toBeInTheDocument();
    expect(n).toBe(2);
  });

  it('to < from → lỗi tại trường "Đến ngày", không gửi request', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    const before = calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn' }));
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-04-10' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-03-05' } });
    const to = screen.getByLabelText('Đến ngày');
    await waitFor(() => expect(to).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu')).toBeInTheDocument();
    expect(to).toHaveAccessibleDescription('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toHaveLength(before);
  });

  it('TEACHER vào /reports → chuyển về /', async () => {
    const calls = spy('*/api/v1/reports/admissions', admissions);
    renderApp({ route: '/reports', user: makeUser('TEACHER') });
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Báo cáo' })).toBeNull());
    expect(calls).toHaveLength(0);
  });

  it('thẻ "Quá hạn" có chú thích "trên hóa đơn tạo trong khoảng"', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    spy('*/api/v1/reports/finance', finance);
    open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Tài chính' }, T));
    const card = await screen.findByTestId('stat-Quá hạn', {}, T);
    expect(within(card).getByText(/trên hóa đơn tạo trong khoảng/)).toBeInTheDocument();
  });

  it('R8 hàng courseId "none"/"Khác" hiển thị như hàng thường', async () => {
    spy('*/api/v1/reports/admissions', {
      ...admissions,
      rows: [...admissions.rows, { courseId: 'none', courseName: 'Khác', leads: 0, newProfiles: 2, conversionRate: 0, enrolled: 0, waiting: 0 }],
    });
    open();
    expect(await screen.findByRole('cell', { name: 'Khác' }, T)).toBeInTheDocument();
    expect(document.querySelector('a[href*="none"]')).toBeNull();
  });

  it('series biểu đồ (reports) dùng fill "var(--chart-N)", không có mã hex', async () => {
    spy('*/api/v1/reports/admissions', admissions);
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    const chart = screen.getByRole('img', { name: /Biểu đồ/ });
    expect(chart.innerHTML).toMatch(/var\(--chart-1\)/);
    expect(chart.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
