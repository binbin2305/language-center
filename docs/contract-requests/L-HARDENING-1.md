# L-HARDENING-1: CORS echoes WEB_ORIGIN to every Origin (NFR-01)

**Route:** every route (global CORS in `apps/api/src/setup-app.ts`, Lead-owned).

**Repro:** `pnpm --filter api test:security -- headers` — tests `CR L-HARDENING-1 CORS: Origin http://evil.test → …` and `CR L-HARDENING-1 CORS preflight: OPTIONS từ http://evil.test → …` (marked `it.failing`).

```
curl -si -H 'Origin: http://evil.test' http://localhost:3000/api/v1/health | grep -i access-control
```

**Expected (H-01A):** a request from an origin other than `WEB_ORIGIN` gets **no** `Access-Control-Allow-Origin` header (simple request and `OPTIONS` preflight); `Origin: WEB_ORIGIN` gets `Access-Control-Allow-Origin: WEB_ORIGIN` + `Access-Control-Allow-Credentials: true` (already passes).

**Actual:** `Access-Control-Allow-Origin: http://localhost:5173` (the configured `WEB_ORIGIN`) is sent to `Origin: http://evil.test` as well. `enableCors({ origin: <string> })` makes the `cors` package emit the fixed string unconditionally. Browsers still block evil.test because the value does not match, so this is not exploitable today, but the response advertises the trusted origin to anyone and the behaviour differs from the spec.

**Suggestion:** pass an array (or a function) so `cors` only reflects a matching origin, and read it through `loadEnv()` like the other settings:

```ts
app.enableCors({ origin: [loadEnv().WEB_ORIGIN], credentials: true });
```

After the fix, change the two `it.failing` in `apps/api/test/security/headers.security-spec.ts` back to `it` (Task M).
