import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane; tests override with server.use(...). */
export const attendanceHandlers: RequestHandler[] = [
  http.get('*/api/v1/settings', () => HttpResponse.json({ data: { attendanceWarningThreshold: 0.2 } })),
  http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/attendance', () =>
    HttpResponse.json({ data: [], meta: { page: 1, limit: 100, total: 0 } }),
  ),
];
