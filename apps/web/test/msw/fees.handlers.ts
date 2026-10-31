import { http, HttpResponse } from 'msw';
import type { RequestHandler } from 'msw';

const emptyPage = ({ request }: { request: Request }) => {
  const sp = new URL(request.url).searchParams;
  return HttpResponse.json({
    data: [],
    meta: { page: Number(sp.get('page') ?? 1), limit: Number(sp.get('limit') ?? 20), total: 0 },
  });
};

/** Default MSW handlers of the fees lane: empty lists. */
export const feesHandlers: RequestHandler[] = [
  http.get('*/api/v1/invoices', emptyPage),
  http.get('*/api/v1/invoices/discounts/pending', emptyPage),
];
