import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

const empty = () => HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0 } });

/** Default MSW handlers of this lane. */
export const enrollmentsHandlers: RequestHandler[] = [
  http.get('*/api/v1/enrollments/waiting', empty),
  http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/enrollments', empty),
];
