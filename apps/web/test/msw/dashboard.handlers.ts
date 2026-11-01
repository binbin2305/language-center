import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default MSW handlers of the dashboard feature (empty dashboard). */
export const dashboardHandlers: RequestHandler[] = [
  http.get('*/api/v1/reports/dashboard', () =>
    HttpResponse.json({
      data: {
        activeStudents: 0,
        ongoingClasses: 0,
        sessionsToday: 0,
        overdueInvoices: 0,
        waitingEnrollments: 0,
        todaySessions: [],
        admissionsTrend: [],
      },
    }),
  ),
];
