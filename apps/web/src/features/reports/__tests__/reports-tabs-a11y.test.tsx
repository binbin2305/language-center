import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };

describe('NFR-06 báo cáo - tab aria-controls trỏ tới panel có thật (CR L-HARDENING-7)', () => {
  it('tab đang chọn luôn có panel tương ứng trong DOM, kể cả khi đang tải và sau khi đổi tab', async () => {
    server.use(
      http.get('*/api/v1/reports/admissions', () => HttpResponse.json({ data: { totals: { leads: 0, newProfiles: 0, conversionRate: null, enrolled: 0, waiting: 0 }, rows: [] } })),
      http.get('*/api/v1/reports/attendance', () => HttpResponse.json({ data: { byClass: [], byStudent: [] } })),
    );
    const user = userEvent.setup();
    renderApp({ route: '/reports', user: makeUser('MANAGER') });
    const first = await screen.findByRole('tab', { name: 'Tuyển sinh' }, T);
    const panelOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-controls') ?? '');
    expect(panelOf(first)).not.toBeNull();
    expect(panelOf(first)).toHaveAttribute('role', 'tabpanel');
    await user.click(screen.getByRole('tab', { name: 'Chuyên cần' }));
    expect(panelOf(screen.getByRole('tab', { name: 'Chuyên cần' }))).not.toBeNull();
  });
});
