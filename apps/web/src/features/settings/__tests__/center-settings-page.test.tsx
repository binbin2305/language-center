import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const settings = {
  centerName: 'Trung tâm A',
  attendanceWarningThreshold: 0.2,
  gradeLockDays: 7,
  resultViewRequiresPaidFees: false,
  teacherAttendanceEditDays: 3,
  invoiceDueDaysAfterStart: 14,
};

describe('trang cài đặt trung tâm (FR-SET-01)', () => {
  it('hiển thị ngưỡng dạng % (0.2 → 20)', async () => {
    server.use(http.get('*/api/v1/settings', () => HttpResponse.json({ data: settings })));
    renderApp({ route: '/settings/center', user: makeUser('MANAGER') });
    expect(await screen.findByLabelText(/^Ngưỡng cảnh báo vắng/)).toHaveValue('20');
  });

  it('nhập ngưỡng 120 (%) → lỗi dưới ô, không gọi PATCH', async () => {
    const patched = vi.fn();
    server.use(
      http.get('*/api/v1/settings', () => HttpResponse.json({ data: settings })),
      http.patch('*/api/v1/settings', () => { patched(); return HttpResponse.json({ data: settings }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/center', user: makeUser('MANAGER') });
    const field = await screen.findByLabelText(/^Ngưỡng cảnh báo vắng/);
    await user.clear(field);
    await user.type(field, '120');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    expect(await screen.findByText('Nhập tỷ lệ phần trăm từ 0 đến 100.')).toBeInTheDocument();
    expect(patched).not.toHaveBeenCalled();
  });

  it('lưu ngưỡng 35% gửi 0.35', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/settings', () => HttpResponse.json({ data: settings })),
      http.patch('*/api/v1/settings', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { ...settings, attendanceWarningThreshold: 0.35 } });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/center', user: makeUser('MANAGER') });
    const field = await screen.findByLabelText(/^Ngưỡng cảnh báo vắng/);
    await user.clear(field);
    await user.type(field, '35');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await screen.findByDisplayValue('35');
    expect(body.attendanceWarningThreshold).toBe(0.35);
  });

  it('lỗi tải → hiện trạng thái lỗi', async () => {
    server.use(http.get('*/api/v1/settings', () => HttpResponse.json({}, { status: 500 })));
    renderApp({ route: '/settings/center', user: makeUser('MANAGER') });
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument();
  });
});
