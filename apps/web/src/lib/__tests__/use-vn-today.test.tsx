import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVnToday } from '../use-vn-today';

describe('useVnToday', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('đổi từ "2026-11-02" sang "2026-11-03" khi fake timer qua 17:00Z (00:00 VN)', async () => {
    vi.setSystemTime(new Date('2026-11-02T16:59:00Z'));
    const { result } = renderHook(() => useVnToday());
    expect(result.current).toBe('2026-11-02');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current).toBe('2026-11-02');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(result.current).toBe('2026-11-03');
  });

  it('dọn timer khi unmount', () => {
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    const { unmount } = renderHook(() => useVnToday());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
