# L-CATALOG-1: StatusBadge groups for course, room, user

`apps/web/src/lib/status.ts` (Lead-owned) has no groups for catalog entities. Please add to `StatusGroup` / `STATUS_LABELS`:

- `course`: ACTIVE "Đang hoạt động" (success), ARCHIVED "Đã lưu trữ" (muted)
- `room`: ACTIVE "Đang hoạt động" (success), INACTIVE "Ngừng hoạt động" (muted)
- `user`: ACTIVE "Đang hoạt động" (success), LOCKED "Đã khóa" (destructive), DISABLED "Đã vô hiệu" (muted)

Until then the lane uses `CatalogStatusBadge` in `features/settings/catalog-shared.tsx` (marked `TODO W1-MERGE`), built only on `components/ui/badge` variants. At merge, replace it with `<StatusBadge group=... />` and delete the local badge.
