import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../../test/render';
import { makeUser } from '../../../test/users';
import { getThemePreference, initTheme, setThemePreference, THEME_STORAGE_KEY } from '../theme';

/** Controllable matchMedia for prefers-color-scheme. */
function mockOs(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return /prefers-color-scheme:\s*dark/.test(query) ? dark : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    dark = next;
    listeners.forEach((cb) => cb());
  };
}
const isDark = () => document.documentElement.classList.contains('dark');

let dispose: () => void = () => undefined;
beforeEach(() => {
  // Node 26 ships a half-working global localStorage; use a plain in-memory Storage.
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
  document.documentElement.classList.remove('dark');
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});

describe('NFR-06 chủ đề sáng/tối (R15)', () => {
  it('mặc định "Hệ thống": theo prefers-color-scheme và đổi trực tiếp khi OS đổi', () => {
    const setOs = mockOs(true);
    dispose = initTheme();
    expect(getThemePreference()).toBe('system');
    expect(isDark()).toBe(true);
    act(() => setOs(false));
    expect(isDark()).toBe(false);
    act(() => setOs(true));
    expect(isDark()).toBe(true);
  });

  it('chọn Sáng/Tối được lưu vào localStorage và không theo OS nữa', () => {
    const setOs = mockOs(false);
    dispose = initTheme();
    act(() => setThemePreference('dark'));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    act(() => setOs(true));
    act(() => setOs(false));
    expect(isDark()).toBe(true);
    act(() => setThemePreference('light'));
    expect(isDark()).toBe(false);
  });

  it('khởi tạo đọc lại lựa chọn đã lưu (qua tải lại trang)', () => {
    mockOs(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    dispose = initTheme();
    expect(getThemePreference()).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('localStorage lỗi vẫn hoạt động (không ném)', () => {
    mockOs(false);
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => {
      dispose = initTheme();
      act(() => setThemePreference('dark'));
    }).not.toThrow();
    expect(isDark()).toBe(true);
  });

  it('menu tài khoản có 3 menuitemradio Hệ thống/Sáng/Tối và đổi html.dark', async () => {
    mockOs(false);
    dispose = initTheme();
    const user = userEvent.setup();
    renderApp({ route: '/', user: makeUser('ADMIN') });
    await user.click(await screen.findByRole('button', { name: 'Tài khoản của tôi' }, { timeout: 10_000 }));
    expect(screen.getByRole('menuitemradio', { name: 'Hệ thống' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Tối' }));
    expect(isDark()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Tài khoản của tôi' }));
    expect(screen.getByRole('menuitemradio', { name: 'Tối' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Sáng' }));
    expect(isDark()).toBe(false);
  });
});
