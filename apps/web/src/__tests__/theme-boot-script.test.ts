import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const inline = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';

function boot(stored: string | null | 'throw', osDark: boolean) {
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('localStorage', {
    getItem: () => {
      if (stored === 'throw') throw new Error('blocked');
      return stored;
    },
  });
  window.matchMedia = ((q: string) => ({ matches: /dark/.test(q) && osDark })) as unknown as typeof window.matchMedia;
  new Function(inline)();
  return document.documentElement.classList.contains('dark');
}
afterEach(() => vi.unstubAllGlobals());

describe('NFR-06 chủ đề áp dụng trước khi vẽ lần đầu (không nháy sáng)', () => {
  it('index.html có script inline trong <head> trước stylesheet và meta color-scheme', () => {
    expect(inline).not.toBe('');
    expect(head.indexOf('<script>')).toBeLessThan(head.indexOf('rel="stylesheet"'));
    expect(head).toContain('<meta name="color-scheme" content="light dark"');
  });
  it('OS tối + chưa chọn -> html.dark; OS sáng -> không', () => {
    expect(boot(null, true)).toBe(true);
    expect(boot(null, false)).toBe(false);
  });
  it('đã lưu Tối/Sáng thắng OS; localStorage lỗi rơi về OS', () => {
    expect(boot('dark', false)).toBe(true);
    expect(boot('light', true)).toBe(false);
    expect(boot('throw', true)).toBe(true);
  });
});
