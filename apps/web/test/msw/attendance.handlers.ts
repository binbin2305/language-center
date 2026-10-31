import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane; tests override with server.use(...). */
export const attendanceHandlers: RequestHandler[] = [
  http.get('*/api/v1/settings', () => HttpResponse.json({ data: { attendanceWarningThreshold: 0.2 } })),
];
