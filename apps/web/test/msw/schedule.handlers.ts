import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

/** Default handlers for the schedule screens (empty calendar); tests override with server.use(...). */
export const scheduleHandlers: RequestHandler[] = [
  http.get('*/api/v1/sessions', () => HttpResponse.json({ data: [] })),
];
