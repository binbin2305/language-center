import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

const empty = () => HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0 } });

/** Defaults for the teacher / student home reads (empty lists); tests override per case. */
export const homeHandlers: RequestHandler[] = [
  http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/results', empty),
  http.get('*/api/v1/invoices', empty),
  http.get('*/api/v1/placement-tests', empty),
];
