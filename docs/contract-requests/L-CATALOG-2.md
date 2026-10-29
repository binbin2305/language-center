# L-CATALOG-2: promote form helpers to lib

`features/settings/catalog-shared.tsx` holds helpers that every form-based feature needs:

- `applyServerFieldErrors(error, setError, duplicateMessages)`: maps `ApiError.details.fields` (codes such as DUPLICATE) onto react-hook-form fields (RULES §4).
- `viParams(messages)`: zod parse params giving one Vietnamese message per field for `zodResolver`.
- `OptionSelect`: thin wrapper over `components/ui/select` for flat option lists (with an optional "all" entry for filters).

Request: Lead promotes these to `apps/web/src/lib/` (or `components/common`) at merge. This file is the only cross-feature import of courses/rooms/users into settings; each import site is marked `TODO W1-MERGE` in the file header.
