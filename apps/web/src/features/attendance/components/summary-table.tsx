import type { AttendanceSummaryRowDto } from '@lc/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const percent = (rate: number) => `${Math.round(rate * 100)}%`;

export interface SummaryTableProps {
  labelHeader: string;
  rows: AttendanceSummaryRowDto[];
  selectedKey?: string | null;
  onSelect?: (row: AttendanceSummaryRowDto) => void;
  /** Accessible name of the per-row button, default "Xem các buổi của <label>". */
}

export function SummaryTable({ labelHeader, rows, selectedKey, onSelect }: SummaryTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHeader}</TableHead>
          <TableHead>Có mặt</TableHead>
          <TableHead>Muộn</TableHead>
          <TableHead>Vắng CP</TableHead>
          <TableHead>Vắng KP</TableHead>
          <TableHead>Tỷ lệ chuyên cần</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} data-state={selectedKey === r.key ? 'selected' : undefined}>
            <TableCell className="font-medium">
              {onSelect ? (
                <button type="button" className="min-h-11 text-left underline-offset-2 hover:underline" onClick={() => onSelect(r)}>
                  {r.label}
                </button>
              ) : (
                r.label
              )}
            </TableCell>
            <TableCell>{r.PRESENT}</TableCell>
            <TableCell>{r.LATE}</TableCell>
            <TableCell>{r.EXCUSED}</TableCell>
            <TableCell>{r.UNEXCUSED}</TableCell>
            <TableCell>{percent(r.attendanceRate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
