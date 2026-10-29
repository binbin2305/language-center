# L-SCHEDULE-1 — wire schedule default MSW handlers

`apps/web/test/msw/handlers.ts` (Lead-owned) must spread the lane handlers so the route-table test
(`src/__tests__/router.test.tsx`, which renders `/schedule` with `onUnhandledRequest: 'error'`)
keeps passing now that `/schedule` issues `GET /api/v1/sessions`:

```ts
import { scheduleHandlers } from './schedule.handlers';
export const handlers: RequestHandler[] = [ ...existing, ...scheduleHandlers ];
```

Until this is wired on `main`, `router.test.tsx > schedule render được cho vai trò đầu tiên được phép (MANAGER)`
fails inside the lane worktree (unhandled `GET /sessions`). `/classes/:id` is unaffected today because its
tab renders only when `?tab=schedule` is active.
