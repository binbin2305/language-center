# L-FEES-2: payments.void permission

The fees web screens gate "Hủy phiếu thu" (void payment) and "Hủy hóa đơn" (void invoice) with `can(user, 'discounts.decide')` because no dedicated permission exists. Both API routes are MANAGER-only.

Request: Lead adds `'payments.void': [MANAGER]` to `PERMISSIONS` in `packages/shared/src/permissions.ts`. At merge, swap `canVoid` in `apps/web/src/features/fees/pages/invoice-detail-page.tsx` (marked `TODO W2-MERGE`) to `can(user, 'payments.void')`.

**Status (Task M, W2):** done — permission added to `@lc/shared` PERMISSIONS and the web gate swapped; TODO W2-MERGE removed.
