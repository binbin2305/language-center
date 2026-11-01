import { cloneElement, type ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
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
const ID = (n: number) => `65000000000000000000a${String(n).padStart(3, '0')}`;

const dashboard = {
  activeStudents: 120,
  ongoingClasses: 8,
  sessionsToday: 2,
  overdueInvoices: 5,
  waitingEnrollments: 7,
  todaySessions: [
    {
      sessionId: ID(1),
      startAt: '2026-11-18T01:00:00Z',
      endAt: '2026-11-18T02:30:00Z',
      classId: ID(2),
      classCode: 'IELTS-01',
      roomCode: 'P101',
      teacherName: 'Cô Lan',
      attendanceTaken: true,
    },
    {
      sessionId: ID(3),
      startAt: '2026-11-18T11:00:00Z',
      endAt: '2026-11-18T12:30:00Z',
      classId: ID(4),
      classCode: 'TOEIC-02',
      roomCode: null,
      teacherName: 'Thầy Minh',
      attendanceTaken: false,
    },
  ],
  admissionsTrend: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(
    (month, i) => ({
      month,
      leads: 10 + i,
      profiles: 4 + i,
    }),
  ),
};
const serve = (body: unknown) =>
  server.use(http.get('*/api/v1/reports/dashboard', () => HttpResponse.json({ data: body })));
const open = () => renderApp({ route: '/', user: makeUser('MANAGER') });
const card = (label: string) => screen.findByTestId(`stat-${label}`, {}, T);

describe('dashboard quản lý/học vụ (FR-RPT-06)', () => {
  it('5 thẻ số hiển thị đúng giá trị', async () => {
    serve(dashboard);
    open();
    expect(within(await card('HV đang học')).getByText('120')).toBeInTheDocument();
    expect(within(await card('Lớp đang mở')).getByText('8')).toBeInTheDocument();
    expect(within(await card('Buổi học hôm nay')).getByText('2')).toBeInTheDocument();
    expect(within(await card('Công nợ quá hạn')).getByText('5')).toBeInTheDocument();
    expect(within(await card('HV chờ xếp lớp')).getByText('7')).toBeInTheDocument();
  });

  it('click "HV chờ xếp lớp" → /enrollments/waiting, "Công nợ quá hạn" → /fees?overdue=true, "Lớp đang mở" → /classes', async () => {
    serve(dashboard);
    open();
    const link = async (label: string) => (await card(label)).closest('a');
    expect(await link('HV chờ xếp lớp')).toHaveAttribute('href', '/enrollments/waiting');
    expect(await link('Công nợ quá hạn')).toHaveAttribute('href', '/fees?overdue=true');
    expect(await link('Lớp đang mở')).toHaveAttribute('href', '/classes');
    await userEvent.click((await link('Lớp đang mở')) as HTMLElement);
    expect(
      await screen.findByRole('heading', { level: 1, name: /lớp học/i }, T),
    ).toBeInTheDocument();
  });

  it('bảng "Buổi học hôm nay" có cột giờ/lớp/phòng/GV/đã điểm danh', async () => {
    serve(dashboard);
    open();
    const table = await screen.findByRole('table', { name: 'Buổi học hôm nay' }, T);
    for (const h of ['Giờ', 'Lớp', 'Phòng', 'Giáo viên', 'Đã điểm danh'])
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('08:00 - 09:30')).toBeInTheDocument();
    expect(within(rows[1]).getByText('IELTS-01')).toBeInTheDocument();
    expect(within(rows[1]).getByText('P101')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Cô Lan')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Đã điểm danh')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Chưa điểm danh')).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
  });

  it('rỗng → "Hôm nay không có buổi học"', async () => {
    serve({ ...dashboard, sessionsToday: 0, todaySessions: [] });
    open();
    expect(await screen.findByText('Hôm nay không có buổi học', {}, T)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Buổi học hôm nay' })).not.toBeInTheDocument();
  });

  it('biểu đồ đường tuyển sinh có 6 điểm', async () => {
    serve(dashboard);
    open();
    expect(
      await screen.findByRole('img', { name: 'Tuyển sinh 6 tháng gần nhất' }, T),
    ).toBeInTheDocument();
    // jsdom has no layout (recharts renders 0x0), so the data points are asserted through the chart's data table.
    const data = screen.getByRole('table', { name: 'Số liệu tuyển sinh 6 tháng' });
    const rows = within(data).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(within(rows[0]).getByText('T06')).toBeInTheDocument();
    expect(
      within(rows[5])
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['T11', '15', '9']);
  });

  it('series biểu đồ (dashboard trend) dùng stroke "var(--chart-N)", không có mã hex', async () => {
    serve(dashboard);
    open();
    const chart = await screen.findByRole('img', { name: 'Tuyển sinh 6 tháng gần nhất' }, T);
    expect(chart.innerHTML).toMatch(/stroke="var\(--chart-1\)"/);
    expect(chart.innerHTML).toMatch(/stroke="var\(--chart-2\)"/);
    expect(chart.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it('render h1 "Tổng quan" khi đang tải', async () => {
    server.use(http.get('*/api/v1/reports/dashboard', async () => new Promise(() => {})));
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tổng quan' }, T),
    ).toBeInTheDocument();
  });
});
