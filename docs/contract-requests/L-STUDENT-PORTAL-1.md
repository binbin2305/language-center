# L-STUDENT-PORTAL-1 — mobile 375px fixes in features/grades (found by P-02)

Owner of the fix: Lead at Task M. Tests marked `it.fails` in
`apps/web/src/features/home/__tests__/mobile-375.test.tsx` — remove `.fails` once fixed.

File: `apps/web/src/features/grades/components/result-cards.tsx` (page `/me/results`, student).

1. Element: `<table className="w-full text-sm">` in `ResultCard`.
   Rule broken: every table must sit inside an `overflow-x-auto` ancestor (or render as cards) at 375px.
   Suggested fix: wrap it: `<div className="overflow-x-auto"><table …/></div>`.
2. Element: button "Tải phiếu điểm PDF" (`<Button variant="outline" size="sm">`, h-8 = 32px).
   Rule broken: primary action touch target must be >= 44px (`min-h-11`).
   Suggested fix: add `className="min-h-11"` (drop `size="sm"`).
