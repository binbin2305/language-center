# L-STUDENT-PORTAL-2 — touch targets < 44px in other features (found by P-02 fix round 1)

Tests are `it.fails` in `apps/web/src/features/home/__tests__/mobile-375.test.tsx`; remove `.fails` once fixed.

1. File: `apps/web/src/features/enrollments/components/confirm-class-banner.tsx` (page `/` student, unconfirmed ENROLLED).
   Element: button "Xác nhận lớp" (`size="sm"`, h-8 = 32px). Rule: primary action >= 44px (`min-h-11`).
   Fix: add `className="min-h-11"` (drop `size="sm"`).
2. File: `apps/web/src/features/schedule/components/session-detail-sheet.tsx:56` (page `/schedule`, teacher, session sheet).
   Element: link "Điểm danh" rendered via default `<Button asChild>` (h-9 = 36px). Rule: primary action >= 44px.
   Fix: `<Button asChild className="min-h-11">`.
