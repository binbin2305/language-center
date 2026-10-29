import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ColumnDef } from '@tanstack/react-table';
import { renderWithProviders } from '../../../../test/render';
import { server } from '../../../../test/msw/server';
import {
  DataTable, MoneyInput, SearchInput, ReasonDialog, CapacityBar, StatusBadge, ConfirmDialog,
  ConflictList, EntitySelect, DatePicker, TimeInput, MoneyText, FormField, PageHeader,
} from '..';

afterEach(() => vi.useRealTimers());

type Row = { name: string };
const columns: ColumnDef<Row>[] = [{ accessorKey: 'name', header: 'Tên' }];
const base = { columns, total: 0, page: 1, limit: 20, onPageChange: () => undefined, empty: { title: 'Chưa có dữ liệu' } };

describe('DataTable', () => {
  it('data rỗng hiện empty.title', () => {
    renderWithProviders(<DataTable {...base} data={[]} />);
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });
  it('isError hiện nút Thử lại gọi onRetry', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<DataTable {...base} data={[]} isError onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('phân trang Trang x/y', async () => {
    const onPageChange = vi.fn();
    renderWithProviders(<DataTable {...base} data={[{ name: 'An' }]} total={45} page={2} onPageChange={onPageChange} />);
    expect(screen.getByText('Trang 2/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
  it('isLoading hiện skeleton', () => {
    renderWithProviders(<DataTable {...base} data={[]} isLoading />);
    expect(screen.queryByText('Chưa có dữ liệu')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('DataTable sort/select/mobile/busy', () => {
  const sortCols: ColumnDef<Row>[] = [
    { accessorKey: 'name', header: 'Tên', enableSorting: true },
    { accessorKey: 'name', id: 'note', header: 'Ghi chú', enableSorting: false, meta: { hideOnMobile: true } },
  ];
  it('sort: click chu kỳ asc -> desc, aria-sort', async () => {
    const onSortChange = vi.fn();
    const { rerender } = renderWithProviders(<DataTable {...base} columns={sortCols} data={[{ name: 'An' }]} total={1} sort="" onSortChange={onSortChange} />);
    const th = screen.getByRole('columnheader', { name: /Tên/ });
    expect(th).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(screen.getByRole('button', { name: /Tên/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('name');
    rerender(<DataTable {...base} columns={sortCols} data={[{ name: 'An' }]} total={1} sort="name" onSortChange={onSortChange} />);
    expect(screen.getByRole('columnheader', { name: /Tên/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /Tên/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('-name');
    expect(screen.queryByRole('button', { name: /Ghi chú/ })).not.toBeInTheDocument();
  });
  it('selection: chọn hàng và chọn tất cả', async () => {
    const onSel = vi.fn();
    const data = [{ name: 'An' }, { name: 'Bình' }];
    renderWithProviders(<DataTable {...base} data={data} total={2} getRowId={(r) => r.name} rowSelection={{}} onRowSelectionChange={onSel} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    expect(onSel).toHaveBeenLastCalledWith({ An: true, 'Bình': true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chọn hàng An' }));
    expect(onSel).toHaveBeenLastCalledWith({ An: true });
  });
  it('không có checkbox khi thiếu onRowSelectionChange', () => {
    renderWithProviders(<DataTable {...base} data={[{ name: 'An' }]} total={1} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('hideOnMobile gắn class ẩn dưới md', () => {
    renderWithProviders(<DataTable {...base} columns={sortCols} data={[{ name: 'An' }]} total={1} />);
    expect(screen.getByRole('columnheader', { name: 'Ghi chú' }).className).toMatch(/hidden md:table-cell/);
  });
  it('loading: aria-busy và phân trang disabled', () => {
    renderWithProviders(<DataTable {...base} data={[]} total={45} page={2} isLoading />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });
});

describe('FormField wiring', () => {
  it('DatePicker/EntitySelect nhận id và aria', () => {
    renderWithProviders(<>
      <FormField label="Ngày sinh" error="Sai">{(p) => <DatePicker {...p} value={null} onChange={() => undefined} />}</FormField>
      <FormField label="Lớp">{(p) => <EntitySelect {...p} entity="class" value={null} onChange={() => undefined} />}</FormField>
    </>);
    expect(screen.getByLabelText('Ngày sinh')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Ngày sinh').getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Lớp' })).toBeInTheDocument();
  });
});

describe('MoneyInput', () => {
  it('gõ 1500000 hiển thị 1.500.000 và onChange nhận number', async () => {
    const onChange = vi.fn();
    function W() {
      const [v, setV] = useState<number | null>(null);
      return <MoneyInput aria-label="Học phí" value={v} onChange={(n) => { onChange(n); setV(n); }} />;
    }
    renderWithProviders(<W />);
    await userEvent.type(screen.getByLabelText('Học phí'), '1500000');
    expect(screen.getByLabelText('Học phí')).toHaveValue('1.500.000');
    expect(onChange).toHaveBeenLastCalledWith(1500000);
  });
  it('từ chối ký tự không phải số', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MoneyInput aria-label="Tiền" value={null} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Tiền'), 'abc');
    expect(onChange).not.toHaveBeenCalledWith(expect.any(Number));
  });
});

describe('SearchInput', () => {
  it('gõ nhanh 5 ký tự chỉ gọi onChange 1 lần sau 300ms', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderWithProviders(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');
    for (const v of ['a', 'ab', 'abc', 'abcd', 'abcde']) fireEvent.change(input, { target: { value: v } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abcde');
  });
});

describe('ReasonDialog', () => {
  it('lý do 3 ký tự thì nút gửi disabled; đủ 5 thì gửi', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<ReasonDialog open onOpenChange={() => undefined} title="Hủy buổi học" onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Gửi' });
    await userEvent.type(screen.getByLabelText('Lý do'), 'abc');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Lý do'), 'de');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('abcde');
  });
});

describe('ConfirmDialog', () => {
  it('xác nhận gọi onConfirm', async () => {
    const onConfirm = vi.fn();
    renderWithProviders(<ConfirmDialog open onOpenChange={() => undefined} title="Xóa?" description="Không thể hoàn tác" confirmLabel="Xóa" destructive onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('CapacityBar', () => {
  it('20/20 có tone destructive', () => {
    renderWithProviders(<CapacityBar current={20} max={20} />);
    expect(screen.getByText('20/20')).toBeInTheDocument();
    expect(screen.getByTestId('capacity-fill').className).toMatch(/bg-destructive/);
  });
  it('18/20 không destructive', () => {
    renderWithProviders(<CapacityBar current={18} max={20} />);
    expect(screen.getByTestId('capacity-fill').className).not.toMatch(/bg-destructive/);
  });
});

describe('StatusBadge', () => {
  it('invoice PARTIAL', () => {
    renderWithProviders(<StatusBadge group="invoice" value="PARTIAL" />);
    expect(screen.getByText('Thanh toán một phần')).toBeInTheDocument();
  });
  it('overdue thêm Quá hạn', () => {
    renderWithProviders(<StatusBadge group="invoice" value="UNPAID" overdue />);
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });
  it.each([
    ['user', 'LOCKED', 'Đã khóa', 'bg-destructive/15'],
    ['course', 'ARCHIVED', 'Đã lưu trữ', 'bg-muted'],
    ['room', 'ACTIVE', 'Đang hoạt động', 'bg-success/15'],
    ['lead', 'NEW', 'Mới', 'bg-info/15'],
    ['student', 'COMPLETED', 'Hoàn thành', 'bg-primary/15'],
  ] as const)('nhóm %s %s → "%s"', (group, value, label, cls) => {
    renderWithProviders(<StatusBadge group={group} value={value} />);
    expect(screen.getByText(label)).toHaveClass(cls);
  });
});

describe('ConflictList', () => {
  it('hiển thị ngày, giờ, loại, mã lớp', () => {
    renderWithProviders(
      <ConflictList conflicts={[
        { kind: 'ROOM', classCode: 'IELTS-01', startAt: '2026-11-02T11:00:00.000Z', endAt: '2026-11-02T12:30:00.000Z', roomId: 'r', teacherId: 't' },
        { kind: 'TEACHER', classCode: 'TOEIC-02', startAt: '2026-11-03T11:00:00.000Z', endAt: '2026-11-03T12:30:00.000Z', roomId: 'r', teacherId: 't' },
      ]} />,
    );
    expect(screen.getByText('Trùng phòng')).toBeInTheDocument();
    expect(screen.getByText('Trùng giáo viên')).toBeInTheDocument();
    expect(screen.getByText(/02\/11/)).toBeInTheDocument();
    expect(screen.getAllByText(/18:00 - 19:30/)).toHaveLength(2);
    expect(screen.getByText('IELTS-01')).toBeInTheDocument();
  });
});

describe('EntitySelect', () => {
  it('gọi /classes?q= sau debounce và chọn kết quả', async () => {
    let q: string | null = null;
    server.use(http.get('*/api/v1/classes', ({ request }) => {
      q = new URL(request.url).searchParams.get('q');
      return HttpResponse.json({ data: [{ id: 'c1', code: 'IELTS-01', name: 'IELTS A' }], meta: { page: 1, limit: 20, total: 1 } });
    }));
    const onChange = vi.fn();
    renderWithProviders(<EntitySelect entity="class" value={null} onChange={onChange} aria-label="Lớp" />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Lớp' }));
    await userEvent.type(screen.getByPlaceholderText('Tìm kiếm...'), 'iel');
    await waitFor(() => expect(q).toBe('iel'));
    const opt = await screen.findByText(/IELTS-01/);
    await userEvent.click(opt);
    expect(onChange).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'c1' }));
  });
});

describe('khác', () => {
  it('MoneyText', () => {
    renderWithProviders(<MoneyText value={1500000} />);
    expect(screen.getByText('1.500.000 ₫')).toBeInTheDocument();
  });
  it('TimeInput phát HH:mm', () => {
    const onChange = vi.fn();
    renderWithProviders(<TimeInput aria-label="Giờ" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Giờ'), { target: { value: '18:30' } });
    expect(onChange).toHaveBeenCalledWith('18:30');
  });
  it('DatePicker hiển thị dd/MM/yyyy và chọn ngày', async () => {
    const onChange = vi.fn();
    renderWithProviders(<DatePicker aria-label="Ngày" value="2026-11-05" onChange={onChange} />);
    const btn = screen.getByRole('button', { name: 'Ngày' });
    expect(btn).toHaveTextContent('05/11/2026');
    await userEvent.click(btn);
    await userEvent.click(await screen.findByText('15'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-11-15'));
  });
  it('FormField gắn aria-describedby với lỗi', () => {
    renderWithProviders(<FormField label="Tên" error="Bắt buộc">{(p) => <input {...p} />}</FormField>);
    const input = screen.getByLabelText('Tên');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Bắt buộc').id);
  });
  it('PageHeader', () => {
    renderWithProviders(<PageHeader title="Học viên" description="Danh sách" actions={<button>Thêm</button>} />);
    expect(screen.getByRole('heading', { name: 'Học viên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
  });
});
