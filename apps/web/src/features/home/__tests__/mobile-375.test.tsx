import { http, HttpResponse } from 'msw';
import { fireEvent, screen, within } from '@testing-library/react';
import { mockViewport } from '../../../../test/media';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

/**
 * P-02 — 375px checks. jsdom has no layout (scrollWidth/clientWidth are 0), so overflow is
 * checked by structural rules instead:
 *  R1 every <table> sits inside an `overflow-x-auto` ancestor (or a FullCalendar `.fc-scroller`);
 *  R2 no element carries an unprefixed fixed width wider than 375px (w-[NNNpx], min-w-[NNNpx], w-96);
 *  R3 each page's primary actions carry `min-h-11` / `h-11`+ (>= 44px).
 */
const T = { timeout: 10_000 };
const id = (n: number) => `65000000000000000000${n.toString(16).padStart(4, '0')}`;
const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const iso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const page = (data: unknown[]) => HttpResponse.json({ data, meta: { page: 1, limit: 50, total: data.length } });

const session = (n: number, over: Record<string, unknown> = {}) => ({
  ...base,
  id: id(0xc00 + n),
  classId: id(0xd01),
  classCode: 'A2-TOI',
  startAt: iso(n + 1),
  endAt: iso(n + 2),
  roomId: id(0xe01),
  roomName: 'P101',
  teacherId: id(0xe02),
  status: 'SCHEDULED',
  cancelReason: null,
  seriesId: null,
  attendanceTakenAt: null,
  ...over,
});
const result = {
  studentId: id(0x501),
  classId: id(0xd01),
  courseId: id(0xb01),
  items: [
    { assessmentId: id(0xa01), name: 'Giữa kỳ', type: 'MIDTERM', weight: 30, score: 8 },
    { assessmentId: id(0xa02), name: 'Cuối kỳ', type: 'FINAL', weight: 70, score: 7 },
  ],
  average: 7.3,
  gradeClass: 'GOOD',
  passed: true,
};
const invoice = {
  ...base,
  id: id(0x701),
  code: 'HD-001',
  kind: 'TUITION',
  studentId: id(0x501),
  enrollmentId: null,
  courseId: id(0xb01),
  description: 'Học phí A2',
  classId: id(0xd01),
  amountDue: 3_000_000,
  discount: null,
  finalAmount: 3_000_000,
  amountPaid: 1_000_000,
  balance: 2_000_000,
  dueDate: '2026-02-01',
  status: 'PARTIAL',
  overdue: false,
};
const enrollment = {
  ...base,
  id: id(0x801),
  studentId: id(0x501),
  courseId: id(0xb01),
  classId: id(0xd01),
  courseName: 'Tiếng Anh A2',
  className: 'Lớp A2 tối',
  status: 'ENROLLED',
  placementLevel: 'A2',
  placementSkipped: null,
  levelOverride: null,
  waitingSince: null,
  enrolledAt: '2026-01-02T00:00:00.000Z',
  confirmedAt: '2026-01-02T00:00:00.000Z',
  transferredToId: null,
  transferredFromId: null,
  invoiceId: null,
  history: [],
};
const unconfirmed = { ...enrollment, id: id(0x802), confirmedAt: null };
const summaryRow = { key: id(0x501), label: 'HV', PRESENT: 8, LATE: 1, EXCUSED: 1, UNEXCUSED: 0, total: 10, attendanceRate: 0.9, absenceRate: 0.1 };
const record = (n: number) => ({
  ...base,
  id: id(0x900 + n),
  sessionId: id(0xc00 + n),
  classId: id(0xd01),
  studentId: id(0x501),
  enrollmentId: id(0x801),
  status: 'PRESENT',
  recordedBy: id(0xe02),
  history: [],
  sessionStartAt: iso(-24 * (n + 1)),
  classCode: 'A2-TOI',
});
const roster = {
  sessionId: id(0xc01),
  taken: false,
  takenAt: null,
  takenByName: null,
  editable: true,
  sessionNote: null,
  roster: [1, 2, 3].map((n) => ({
    studentId: id(0x500 + n),
    enrollmentId: id(0x800 + n),
    studentCode: `HV00${n}`,
    fullName: `Học viên ${n}`,
    status: null,
    history: [],
    absenceRate: 0.3,
  })),
};

/** Seeds every read the 375px pages need with real rows. */
function stubData() {
  server.use(
    http.get('*/api/v1/sessions', () => HttpResponse.json({ data: [session(0), session(1), session(2)] })),
    http.get('*/api/v1/sessions/:id', () => HttpResponse.json({ data: session(0) })),
    http.get('*/api/v1/sessions/:id/attendance', () => HttpResponse.json({ data: roster })),
    http.get('*/api/v1/assessments/pending', () =>
      HttpResponse.json({
        data: [
          {
            ...base,
            id: id(0xa01),
            classId: id(0xd01),
            classCode: 'A2-TOI',
            className: 'Lớp A2 tối',
            name: 'Giữa kỳ',
            type: 'MIDTERM',
            weight: 30,
            heldOn: '2026-01-03',
            confirmedAt: null,
            unlockedUntil: null,
            lockedAt: '2026-02-01T00:00:00.000Z',
            isLocked: false,
          },
        ],
      }),
    ),
    http.get('*/api/v1/placement-tests', () => page([])),
    http.get('*/api/v1/classes/:id', () =>
      HttpResponse.json({ data: { ...base, id: id(0xd01), code: 'A2-TOI', name: 'Lớp A2 tối', courseId: id(0xb01) } }),
    ),
    http.get('*/api/v1/results', () => page([result])),
    http.get('*/api/v1/invoices', () => page([invoice])),
    http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [enrollment] })),
    http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [summaryRow] })),
    http.get('*/api/v1/attendance', () => page([record(0), record(1), record(2)])),
  );
}

const widthPx = (cls: string): number | null => {
  const m = /^(?:min-)?w-\[(\d+)px\]$/.exec(cls);
  if (m) return Number(m[1]);
  const u = /^(?:min-)?w-(\d+)$/.exec(cls);
  return u ? Number(u[1]) * 4 : null;
};

/** R1 over the whole rendered tree. */
function expectTablesScroll(root: ParentNode = document.body) {
  const unwrapped = [...root.querySelectorAll('table')].filter(
    (t) => !t.closest('.overflow-x-auto') && !t.closest('.fc-scroller'),
  );
  expect(unwrapped.map((t) => t.className || t.outerHTML.slice(0, 80))).toEqual([]);
}

/** R2 over the whole rendered tree. */
function expectNoFixedWide(root: ParentNode = document.body) {
  const tooWide: string[] = [];
  root.querySelectorAll('[class]').forEach((el) => {
    for (const cls of String(el.getAttribute('class')).split(/\s+/)) {
      const w = widthPx(cls);
      if (w !== null && w > 375) tooWide.push(`${el.tagName}.${cls}`);
    }
  });
  expect(tooWide).toEqual([]);
}

function expectNoOverflowRisk() {
  expectTablesScroll();
  expectNoFixedWide();
}

/** R3 */
function expectTouchTarget(el: HTMLElement) {
  const ok = el.className.split(/\s+/).some((c) => /^(min-)?h-(11|12|14|16)$/.test(c));
  expect({ name: el.textContent, ok, className: el.className }).toMatchObject({ ok: true });
}

beforeEach(() => {
  mockViewport(375);
  stubData();
});

const teacher = () => makeUser('TEACHER');
const student = () => makeUser('STUDENT', { studentId: id(0x501) });

describe('P-02 self-test: helpers can fail', () => {
  it('R1 bắt bảng không bọc, R2 bắt width cố định > 375px, R3 bắt nút thấp', () => {
    const bad = document.createElement('div');
    bad.innerHTML = '<table></table><div class="w-[400px]"></div><div class="min-w-96"></div>';
    expect(() => expectTablesScroll(bad)).toThrow();
    expect(() => expectNoFixedWide(bad)).toThrow();
    const ok = document.createElement('div');
    ok.innerHTML = '<div class="overflow-x-auto"><table></table></div><div class="w-[375px] md:w-[600px]"></div>';
    expect(() => expectTablesScroll(ok)).not.toThrow();
    expect(() => expectNoFixedWide(ok)).not.toThrow();
    const low = document.createElement('button');
    low.className = 'h-8';
    expect(() => expectTouchTarget(low)).toThrow();
  });
});

describe('P-02 mobile 375px — giáo viên', () => {
  it('NFR: / (GV) không có nguy cơ tràn ngang, nút Điểm danh cao >= 44px', async () => {
    renderApp({ route: '/', user: teacher() });
    const link = await screen.findByRole('link', { name: 'Điểm danh' }, T);
    expect(await screen.findByText('Giữa kỳ', {}, T)).toBeInTheDocument();
    expectNoOverflowRisk();
    expectTouchTarget(link);
  });

  it('FR-ATT-02: /sessions/:id/attendance (GV) danh sách 3 HV, nút chính >= 44px, không tràn ngang', async () => {
    renderApp({ route: `/sessions/${id(0xc01)}/attendance`, user: teacher() });
    expect(await screen.findByText('Học viên 3', {}, T)).toBeInTheDocument();
    expectNoOverflowRisk();
    expectTouchTarget(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    expectTouchTarget(screen.getByRole('button', { name: 'Tất cả có mặt' }));
    for (const label of ['Có mặt', 'Muộn', 'Vắng CP', 'Vắng KP']) {
      const buttons = screen.getAllByRole('button', { name: label });
      expect(buttons).toHaveLength(3);
      buttons.forEach(expectTouchTarget);
    }
  });

  it('FR-SCH-05: /schedule (GV) hiện danh sách tuần trên 375px không tràn ngang', async () => {
    const { container } = renderApp({ route: '/schedule', user: teacher() });
    expect((await screen.findAllByText(/A2-TOI/, {}, T)).length).toBeGreaterThan(0);
    expect(container.querySelector('.fc-list, .fc-scroller')).not.toBeNull();
    expectNoOverflowRisk();
  });

  // Regression for CR L-STUDENT-PORTAL-2 (fixed in Task M).
  it('FR-ATT-02: /schedule (GV) nút Điểm danh trong chi tiết buổi cao >= 44px (CR L-STUDENT-PORTAL-2)', async () => {
    renderApp({ route: '/schedule', user: teacher() });
    const items = await screen.findAllByText(/A2-TOI/, {}, T);
    fireEvent.click(items[0]!);
    const dialog = await screen.findByRole('dialog', {}, T);
    expectTouchTarget(within(dialog).getByRole('link', { name: 'Điểm danh' }));
  });
});

describe('P-02 mobile 375px — học viên', () => {
  it('NFR: / (HV) không có nguy cơ tràn ngang, các link "Xem …" cao >= 44px', async () => {
    renderApp({ route: '/', user: student() });
    expect(await screen.findByRole('heading', { name: 'Trang của tôi' }, T)).toBeInTheDocument();
    expect(await screen.findByText(/A2-TOI/, {}, T)).toBeInTheDocument();
    expect(await screen.findByText('Hạn gần nhất: 01/02/2026', { exact: false }, T)).toBeInTheDocument();
    expectNoOverflowRisk();
    for (const name of ['Xem lịch học', 'Xem chi tiết', 'Xem kết quả', 'Xem học phí'])
      expectTouchTarget(screen.getByRole('link', { name }));
  });

  // Regression for CR L-STUDENT-PORTAL-2 (fixed in Task M).
  it('FR-CLS-11: / (HV) nút Xác nhận lớp cao >= 44px (CR L-STUDENT-PORTAL-2)', async () => {
    server.use(http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [unconfirmed] })));
    renderApp({ route: '/', user: student() });
    expectTouchTarget(await screen.findByRole('button', { name: 'Xác nhận lớp' }, T));
  });

  it('FR-SCH-05: /schedule (HV) không tràn ngang', async () => {
    renderApp({ route: '/schedule', user: student() });
    expect((await screen.findAllByText(/A2-TOI/, {}, T)).length).toBeGreaterThan(0);
    expectNoOverflowRisk();
  });

  // Regression for CR L-STUDENT-PORTAL-1 (fixed in Task M).
  it('FR-GRD-06: /me/results bảng điểm bọc overflow-x-auto (CR L-STUDENT-PORTAL-1)', async () => {
    renderApp({ route: '/me/results', user: student() });
    expect((await screen.findAllByText('Giữa kỳ', {}, T)).length).toBeGreaterThan(0);
    expectTablesScroll();
  });

  // Regression for CR L-STUDENT-PORTAL-1 (fixed in Task M).
  it('FR-GRD-06: /me/results nút Tải phiếu điểm PDF cao >= 44px (CR L-STUDENT-PORTAL-1)', async () => {
    renderApp({ route: '/me/results', user: student() });
    expect((await screen.findAllByText('Giữa kỳ', {}, T)).length).toBeGreaterThan(0);
    expectTouchTarget(screen.getByRole('button', { name: 'Tải phiếu điểm PDF' }));
  });

  it('FR-GRD-06: /me/results không có độ rộng cố định > 375px', async () => {
    renderApp({ route: '/me/results', user: student() });
    expect((await screen.findAllByText('Giữa kỳ', {}, T)).length).toBeGreaterThan(0);
    expectNoFixedWide();
  });

  it('FR-FEE-05: /me/fees thẻ hóa đơn không tràn ngang', async () => {
    renderApp({ route: '/me/fees', user: student() });
    const card = await screen.findByRole('article', { name: /HD-001/ }, T);
    expect(card).toBeInTheDocument();
    expectNoOverflowRisk();
  });

  it('FR-ATT-06: /me/attendance không tràn ngang', async () => {
    renderApp({ route: '/me/attendance', user: student() });
    expect(await screen.findByText('Tỷ lệ chuyên cần', {}, T)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Các buổi đã học' }, T);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expectNoOverflowRisk();
  });

  it('FR-CLS-11: /me/classes không tràn ngang', async () => {
    renderApp({ route: '/me/classes', user: student() });
    expect(await screen.findByText('Tiếng Anh A2', {}, T)).toBeInTheDocument();
    expectNoOverflowRisk();
  });
});
