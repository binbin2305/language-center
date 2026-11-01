import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane: empty-but-valid reports. */
export const reportsHandlers: RequestHandler[] = [
  http.get('*/api/v1/reports/admissions', () =>
    HttpResponse.json({ data: { totals: { leads: 0, newProfiles: 0, conversionRate: 0, enrolled: 0, waiting: 0 }, rows: [] } }),
  ),
  http.get('*/api/v1/reports/attendance', () => HttpResponse.json({ data: { byClass: [], byStudent: [], overThreshold: [] } })),
  http.get('*/api/v1/reports/academic', () =>
    HttpResponse.json({ data: { rows: [], distribution: {}, passRate: 0, failRate: 0 } }),
  ),
  http.get('*/api/v1/reports/finance', () =>
    HttpResponse.json({ data: { totals: { revenue: 0, totalDue: 0, outstanding: 0, overdue: 0, totalDiscount: 0 }, rows: [] } }),
  ),
];
