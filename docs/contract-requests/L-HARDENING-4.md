# L-HARDENING-4: dark-mode tokens are purged from the production CSS (NFR-06, DESIGN section 1)

**Page/route:** every page (`apps/web/src/index.css`, `apps/web/tailwind.config.ts`). Lead/FE-owned.

**Repro:** `pnpm build`, `grep -c dark apps/web/dist/assets/*.css` prints `0`. Test: `e2e/a11y/a11y.spec.ts` "tokens .dark có trong CSS production" (`test.fail(true,'CR L-HARDENING-4')`).

**Expected:** the `.dark { --background: ... }` token block (DESIGN section 1 "có dark mode") is present in the built CSS, and something sets `.dark` on `<html>` (theme toggle and/or `prefers-color-scheme`).

**Actual:** the block sits inside `@layer base`; Tailwind removes `@layer` rules whose class (`.dark`) is not used in `content`, so the build has only light tokens. There is also no code that ever adds the `dark` class (`grep -rn "classList\|prefers-color" apps/web/src` finds nothing). Dark mode does not exist at runtime.

**Suggestion:** add `safelist: ['dark']` to `tailwind.config.ts` (or move the `.dark` block out of `@layer base`), and add a theme provider (localStorage + `prefers-color-scheme`) toggling `document.documentElement.classList`. Until then the a11y spec injects the source `.dark` tokens so the dark palette is still audited (see CR L-HARDENING-6).
