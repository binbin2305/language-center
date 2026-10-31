import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';
import { attendanceHandlers } from './attendance.handlers';
import { enrollmentsHandlers } from './enrollments.handlers';
import { feesHandlers } from './fees.handlers';
import { gradesHandlers } from './grades.handlers';
import { placementHandlers } from './placement.handlers';
import { scheduleHandlers } from './schedule.handlers';
import { wave1Handlers } from './wave1.handlers';

/** Default handlers; tests add their own with server.use(...). */
export const handlers: RequestHandler[] = [
  // The app shell's bell polls these on every authenticated page.
  http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ data: { count: 0 } })),
  http.get('*/api/v1/notifications', () =>
    HttpResponse.json({ data: [], meta: { page: 1, limit: 10, total: 0 } }),
  ),
  ...wave1Handlers,
  ...scheduleHandlers,
  ...enrollmentsHandlers,
  ...placementHandlers,
  ...attendanceHandlers,
  ...gradesHandlers,
  ...feesHandlers,
];
