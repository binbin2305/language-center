import type { RequestHandler } from 'msw';

/** Default MSW handlers of this lane: filled by the lane that owns `features/home`. */
export const homeHandlers: RequestHandler[] = [];
