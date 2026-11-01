import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * NFR-06 (WCAG AA 1.4.3): status colours are used as `bg-<t>/15 text-<t>` (badges, attendance, grades, notes) and as
 * `bg-<t> text-<t>-foreground`. Both pairs must reach 4.5:1 on the card and page background, light and dark
 * (Task M: axe found text-info 3.06 and text-destructive 3.65 on their light tints once the CR-5 known set was removed).
 */
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const tokens = (selector: string): Record<string, string> => {
  const body = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
type Rgb = [number, number, number];
const hsl = (v: string): Rgb => {
  const [h, s, l] = v.split(/\s+/).map((x) => parseFloat(x));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tint = (c: Rgb, surface: Rgb, alpha = 0.15): Rgb => c.map((v, i) => v * alpha + surface[i] * (1 - alpha)) as Rgb;

describe('NFR-06 tương phản token trạng thái ≥ 4.5:1 (sáng và tối)', () => {
  for (const [mode, selector] of [
    ['light', ':root'],
    ['dark', '\\.dark'],
  ] as const) {
    const t = tokens(selector);
    for (const name of ['destructive', 'success', 'warning', 'info']) {
      it(`${mode} ${name}: text-${name} trên nền bg-${name}/15 (card, background) và ${name}-foreground trên bg-${name}`, () => {
        const c = hsl(t[name]);
        const got = {
          onCardTint: ratio(c, tint(c, hsl(t.card))) >= 4.5,
          onBackgroundTint: ratio(c, tint(c, hsl(t.background))) >= 4.5,
          foregroundOnSolid: ratio(hsl(t[`${name}-foreground`]), c) >= 4.5,
        };
        expect({ token: `${name}: ${t[name]}`, ...got }).toEqual({ token: `${name}: ${t[name]}`, onCardTint: true, onBackgroundTint: true, foregroundOnSolid: true });
      });
    }
  }
});
