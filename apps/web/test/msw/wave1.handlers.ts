import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

const emptyPage = ({ request }: { request: Request }) => {
  const sp = new URL(request.url).searchParams;
  return HttpResponse.json({
    data: [],
    meta: { page: Number(sp.get('page') ?? 1), limit: Number(sp.get('limit') ?? 20), total: 0 },
  });
};

/**
 * Wave 1 list endpoints answer with an empty page by default so pages that load pickers or
 * lists (route table, login redirects) do not trip `onUnhandledRequest: 'error'`.
 * Feature tests override with server.use(...).
 */
export const wave1Handlers: RequestHandler[] = [
  http.get('*/api/v1/courses', emptyPage),
  http.get('*/api/v1/rooms', emptyPage),
  http.get('*/api/v1/users', emptyPage),
  http.get('*/api/v1/teachers', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/leads', emptyPage),
  http.get('*/api/v1/students', emptyPage),
  http.get('*/api/v1/classes', emptyPage),
  http.get('*/api/v1/classes/:id/students', emptyPage),
];
