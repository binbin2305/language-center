/** Lowercase, strip diacritics (incl. đ/Đ) — for search/normalisation. */
export function removeVietnameseTones(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}
