import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const note = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'CLASS_ASSIGNED',
  title: `Thông báo ${id.slice(-1)}`,
  body: 'Nội dung',
  refType: null,
  refId: null,
  readAt: null,
  createdAt: '2026-10-26T01:00:00.000Z',
  ...over,
});
const ID1 = '65000000000000000000000a';
const ID2 = '65000000000000000000000b';
const meta = { page: 1, limit: 20, total: 2 };

describe('chuông thông báo', () => {
  it('hiển thị số chưa đọc từ /notifications/unread-count', async () => {
    server.use(
      http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ data: { count: 3 } })),
    );
    renderApp({ route: '/', user: makeUser('MANAGER') });
    expect(await screen.findByLabelText('Thông báo, 3 chưa đọc')).toBeInTheDocument();
  });

  it('mở popover hiện thông báo mới nhất và liên kết "Xem tất cả"', async () => {
    server.use(
      http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ data: { count: 1 } })),
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json({ data: [note(ID1)], meta: { ...meta, total: 1 } }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/', user: makeUser('MANAGER') });
    await user.click(await screen.findByLabelText('Thông báo, 1 chưa đọc'));
    expect(await screen.findByText('Thông báo a')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/notifications');
  });
});

describe('trang thông báo', () => {
  it('lọc chưa đọc gửi unread=true', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/api/v1/notifications', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('unread') ?? '');
        return HttpResponse.json({ data: [note(ID1)], meta });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/notifications', user: makeUser('MANAGER') });
    await screen.findByText('Thông báo a');
    await user.click(screen.getByRole('checkbox', { name: 'Chỉ hiện chưa đọc' }));
    await waitFor(() => expect(seen).toContain('true'));
  });

  it('click thông báo chưa đọc gọi /read; refType lạ thì ở lại trang', async () => {
    let read = '';
    server.use(
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json({ data: [note(ID1, { refType: 'WEIRD', refId: ID2 })], meta }),
      ),
      http.post('*/api/v1/notifications/:id/read', ({ params }) => {
        read = String(params.id);
        return HttpResponse.json({ data: note(ID1, { readAt: '2026-10-26T02:00:00.000Z' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/notifications', user: makeUser('MANAGER') });
    await user.click(await screen.findByText('Thông báo a'));
    await waitFor(() => expect(read).toBe(ID1));
    expect(screen.getByRole('heading', { name: 'Thông báo' })).toBeInTheDocument();
  });

  it('click thông báo có refType CLASS điều hướng tới lớp', async () => {
    server.use(
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json({ data: [note(ID1, { refType: 'CLASS', refId: ID2 })], meta }),
      ),
      http.post('*/api/v1/notifications/:id/read', () => HttpResponse.json({ data: note(ID1) })),
    );
    const user = userEvent.setup();
    renderApp({ route: '/notifications', user: makeUser('MANAGER') });
    await user.click(await screen.findByText('Thông báo a'));
    expect(await screen.findByRole('heading', { name: 'Chi tiết lớp' })).toBeInTheDocument();
  });

  it('"Đánh dấu tất cả đã đọc" gọi read-all', async () => {
    let called = false;
    server.use(
      http.get('*/api/v1/notifications', () => HttpResponse.json({ data: [note(ID1)], meta })),
      http.post('*/api/v1/notifications/read-all', () => {
        called = true;
        return HttpResponse.json({ data: { ok: true } });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/notifications', user: makeUser('MANAGER') });
    await screen.findByText('Thông báo a');
    await user.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('danh sách rỗng hiện trạng thái rỗng', async () => {
    server.use(
      http.get('*/api/v1/notifications', () =>
        HttpResponse.json({ data: [], meta: { ...meta, total: 0 } }),
      ),
    );
    renderApp({ route: '/notifications', user: makeUser('MANAGER') });
    expect(await screen.findByText('Chưa có thông báo nào')).toBeInTheDocument();
  });
});
