import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of L-ENROLL placement screens (empty list; tests override with server.use). */
export const placementHandlers: RequestHandler[] = [
  http.get('*/api/v1/placement-tests', () =>
    HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  ),
  http.get('*/api/v1/placement-tests/:id', () =>
    HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
  ),
];
