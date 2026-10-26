import type { RequestHandler } from 'msw';

/** Default handlers; tests add their own with server.use(...). */
export const handlers: RequestHandler[] = [];
