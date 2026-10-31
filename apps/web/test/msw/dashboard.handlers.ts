import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane: filled by the lane that owns `features/dashboard`. */
export const dashboardHandlers: RequestHandler[] = [];
