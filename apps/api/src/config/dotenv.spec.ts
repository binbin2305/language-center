import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnvFile } from './dotenv';

describe('loadDotEnvFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-dotenv-'));

  afterEach(() => {
    delete process.env.LC_DOTENV_A;
    delete process.env.LC_DOTENV_B;
  });

  it('nạp biến từ file .env vào process.env', () => {
    const file = join(dir, 'a.env');
    writeFileSync(file, 'LC_DOTENV_A=from-file\n');
    expect(loadDotEnvFile(file)).toBe(true);
    expect(process.env.LC_DOTENV_A).toBe('from-file');
  });

  it('không ghi đè biến đã có trong môi trường', () => {
    const file = join(dir, 'b.env');
    writeFileSync(file, 'LC_DOTENV_B=from-file\n');
    process.env.LC_DOTENV_B = 'from-shell';
    loadDotEnvFile(file);
    expect(process.env.LC_DOTENV_B).toBe('from-shell');
  });

  it('bỏ qua khi file không tồn tại', () => {
    expect(loadDotEnvFile(join(dir, 'missing.env'))).toBe(false);
  });
});
