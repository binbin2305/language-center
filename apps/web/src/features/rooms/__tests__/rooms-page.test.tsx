import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const empty = { data: [], meta: { page: 1, limit: 20, total: 0 } };

describe('trang phòng học (FR-CAT-02)', () => {
  it('sức chứa 0 → lỗi dưới ô, không gọi POST', async () => {
    const posted = vi.fn();
    server.use(
      http.get('*/api/v1/rooms', () => HttpResponse.json(empty)),
      http.post('*/api/v1/rooms', () => { posted(); return HttpResponse.json({}, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/rooms', user: makeUser('ACADEMIC_STAFF') });
    await user.click(await screen.findByRole('button', { name: 'Thêm phòng học' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Mã/), 'P101');
    await user.type(within(dialog).getByLabelText(/^Tên phòng/), 'Phòng 101');
    await user.type(within(dialog).getByLabelText(/^Sức chứa/), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Sức chứa phải là số nguyên lớn hơn 0.')).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it('tạo phòng thành công gửi mã in hoa và hiện hàng mới', async () => {
    const rows: unknown[] = [];
    let body: unknown;
    server.use(
      http.get('*/api/v1/rooms', () => HttpResponse.json({ data: rows, meta: { page: 1, limit: 20, total: rows.length } })),
      http.post('*/api/v1/rooms', async ({ request }) => {
        body = await request.json();
        rows.push({ id: '65000000000000000000d001', code: 'P101', name: 'Phòng 101', capacity: 20, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
        return HttpResponse.json({ data: rows[0] }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/rooms', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm phòng học' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Mã/), 'p101');
    await user.type(within(dialog).getByLabelText(/^Tên phòng/), 'Phòng 101');
    await user.type(within(dialog).getByLabelText(/^Sức chứa/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('cell', { name: 'P101' })).toBeInTheDocument();
    expect(body).toMatchObject({ code: 'P101', capacity: 20 });
  });

  it('409 mã trùng → thông báo dưới ô Mã', async () => {
    server.use(
      http.get('*/api/v1/rooms', () => HttpResponse.json(empty)),
      http.post('*/api/v1/rooms', () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'x', details: { fields: { code: 'DUPLICATE' } } } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/rooms', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm phòng học' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Mã/), 'P101');
    await user.type(within(dialog).getByLabelText(/^Tên phòng/), 'Phòng 101');
    await user.type(within(dialog).getByLabelText(/^Sức chứa/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Mã phòng đã tồn tại')).toBeInTheDocument();
  });

  it('danh sách rỗng và lỗi tải', async () => {
    server.use(http.get('*/api/v1/rooms', () => HttpResponse.json({}, { status: 500 })));
    renderApp({ route: '/settings/rooms', user: makeUser('MANAGER') });
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument();
  });
});
