import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import tailwindConfig from '../../tailwind.config';

/** CR L-HARDENING-4: Tailwind purged the unused `.dark` rule; compile the real entry CSS with the real config. */
describe('NFR-06 token .dark có trong CSS production (CR L-HARDENING-4)', () => {
  it('tailwind.config safelist giữ lớp dark (không phụ thuộc chuỗi "dark" trong mã nguồn)', () => {
    expect(tailwindConfig.safelist).toContain('dark');
  });

  it('Tailwind build giữ khối .dark với đủ token màu', () => {
    const root = resolve(__dirname, '../..');
    const out = mkdtempSync(join(tmpdir(), 'lc-css-'));
    try {
      execFileSync('pnpm', ['exec', 'tailwindcss', '-c', 'tailwind.config.ts', '-i', 'src/index.css', '-o', join(out, 'o.css'), '--minify'], { cwd: root, stdio: 'pipe' });
      const css = readFileSync(join(out, readdirSync(out)[0]), 'utf8');
      const block = /(?:^|[}\s,])\.dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(block).toContain('--background:');
      expect(block).toContain('--primary-foreground:');
      expect(block).toContain('--destructive:');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
