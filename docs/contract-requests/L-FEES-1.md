# L-FEES-1: Invoice schema lacks `voidReason`

F-01 `voidForEnrollment(id, reason, s)` must persist `voidReason` (brief), but `apps/api/src/database/schemas/invoice.schema.ts` (Lead-owned) has no such field.
Request: add `voidReason?: string` (and optionally `voidedAt`) to `Invoice` / `InvoiceSchema`.
Workaround in lane: `updateOne(..., { strict: false })` writes the field anyway until the schema gains it.
