import { cloneElement, type ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    await screen.findByRole('cell', { name: 'IELTS Foundation' }, T);
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(hits).toHaveLength(1));
    expect([hits[0].get('format'), hits[0].get('from'), hits[0].get('to')]).toEqual(['xlsx', '2026-11-01', '2026-11-18']);
    await userEvent.click(screen.getByRole('button', { name: 'Xuất PDF' }));
    await waitFor(() => expect(hits).toHaveLength(2));
    expect(hits[1].get('format')).toBe('pdf');
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
