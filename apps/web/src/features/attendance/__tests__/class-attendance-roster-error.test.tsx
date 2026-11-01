import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };
const CLASS_ID = '65000000000000000000c001';
const S1 = '6500000000000000000e0001';
const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const D1 = '6500000000000000000d0001';
const cls = {
  ...base, id: CLASS_ID, code: 'IELTS-01', name: 'IELTS', courseId: '65000000000000000000d001', courseName: 'IELTS',
  level: 'Foundation', teacherId: '65000000000000000000b001', teacherName: 'Cô Lan', defaultRoomId: null,
  maxCapacity: 20, currentSize: 1, startDate: '2026-01-05', endDate: '2026-04-05', status: 'ONGOING',
};
const rec = {
  ...base, id: 'r1', sessionId: D1, classId: CLASS_ID, studentId: S1, enrollmentId: '6500000000000000000f0001',
  status: 'PRESENT', recordedBy: '650000000000000000000001', history: [], sessionStartAt: '2026-01-13T11:00:00.000Z',
  studentName: 'Nguyễn Văn A', classCode: 'IELTS-01',
};

describe('ma trận điểm danh khi roster lỗi', () => {
  it('FR-ATT-04 roster GET /classes/:id/students lỗi → ma trận vẫn hiện từ bản ghi điểm danh + cảnh báo "Không tải được danh sách lớp" có nút Thử lại', async () => {
    let rosterCalls = 0;
    server.use(
      http.get('*/api/v1/classes/:id/students', () => {
        rosterCalls++;
        return HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 });
      }),
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: cls })),
      http.get('*/api/v1/sessions', () =>
        HttpResponse.json({
          data: [{ ...base, id: D1, classId: CLASS_ID, roomId: '65000000000000000000a001', teacherId: '65000000000000000000b001',
            startAt: '2026-01-13T11:00:00.000Z', endAt: '2026-01-13T12:00:00.000Z', status: 'SCHEDULED', cancelReason: null, seriesId: null, attendanceTakenAt: null }],
        }),
      ),
      http.get('*/api/v1/attendance', () => HttpResponse.json({ data: [rec], meta: { page: 1, limit: 100, total: 1 } })),
    );
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: `/classes/${CLASS_ID}?tab=attendance` });
    const matrix = await screen.findByRole('table', { name: 'Ma trận điểm danh' }, T);
    expect(within(matrix).getByText('Nguyễn Văn A')).toBeInTheDocument();
    const warn = await screen.findByText('Không tải được danh sách lớp', {}, T);
    expect(warn).toBeInTheDocument();
    const before = rosterCalls;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() => expect(rosterCalls).toBeGreaterThan(before), T);
  });
});
