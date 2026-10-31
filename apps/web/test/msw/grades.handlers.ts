import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane: empty lists so unmocked screens render empty states. */
export const gradesHandlers: RequestHandler[] = [
  http.get('*/api/v1/classes/:id/assessments', () => HttpResponse.json({ data: [] })),
];
