# L-HARDENING-4: dark-mode tokens are purged from the production CSS (NFR-06, DESIGN section 1)

**Page/route:** every page (`apps/web/src/index.css`, `apps/web/tailwind.config.ts`). Lead/FE-owned.

**Repro:** `pnpm build`, `grep -c dark apps/web/dist/assets/*.css` prints `0`. Test: `e2e/a11y/a11y.spec.ts` "tokens .dark có trong CSS production" (`test.fail(true,'CR L-HARDENING-4')`).

**Expected:** the `.dark { --background: ... }` token block (DESIGN section 1 "có dark mode") is present in the built CSS, and something sets `.dark` on `<html>` (theme toggle and/or `prefers-color-scheme`).

**Actual:** the block sits inside `@layer base`; Tailwind removes `@layer` rules whose class (`.dark`) is not used in `content`, so the build has only light tokens. There is also no code that ever adds the `dark` class (`grep -rn "classList\|prefers-color" apps/web/src` finds nothing). Dark mode does not exist at runtime.

**Suggestion:** add `safelist: ['dark']` to `tailwind.config.ts` (or move the `.dark` block out of `@layer base`), and add a theme provider (localStorage + `prefers-color-scheme`) toggling `document.documentElement.classList`. Until then the a11y spec injects the source `.dark` tokens so the dark palette is still audited (see CR L-HARDENING-6).

## Ruling R15 (expected behaviour) and the locators the spec uses
Dark mode follows OS `prefers-color-scheme` live and has a user-menu toggle persisted in localStorage; the `.dark` token block must survive the build.
- Spec `NFR-06 a11y CR 4: app sets html.dark ...`: with `emulateMedia({ colorScheme: 'dark' })` on `/login`, the app sets `html.dark` and a served stylesheet has a `.dark`/`html.dark`/`:root.dark` rule.
- Spec `NFR-06 a11y CR 4: user-menu theme toggle ...`: in the account menu (button aria-label `Tài khoản của tôi`) three items with role `menuitemradio` and exact names `Hệ thống`, `Sáng`, `Tối`. Choosing `Tối` sets `html.dark` and survives a reload; `Sáng` clears it; `Hệ thống` follows the OS live (emulateMedia change toggles `html.dark` without reload).
When fixed, set `CR4_OPEN = false` in `e2e/a11y/a11y.spec.ts` (one line): the workaround (class + injected tokens) is then off and both CR-4 tests require the real behaviour.

**Status:** Fixed in lane/L-LEAD 3aee0dd (+ 2c68f76 pre-paint boot script). Task M: `CR4_OPEN = false` in `e2e/a11y/a11y.spec.ts`. (from `docs/contract-requests/L-07-status.md`)
