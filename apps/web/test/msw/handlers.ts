import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default handlers; tests add their own with server.use(...). */
export const handlers: RequestHandler[] = [
  // The app shell's bell polls these on every authenticated page.
  http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ data: { count: 0 } })),
  http.get('*/api/v1/notifications', () =>
    HttpResponse.json({ data: [], meta: { page: 1, limit: 10, total: 0 } }),
  ),
];
