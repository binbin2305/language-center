import { useRef, type KeyboardEvent } from 'react';
import type { AssessmentGradesDto } from '@lc/shared';
import { isValidScore } from '@lc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export type GradeRow = AssessmentGradesDto['rows'][number];
export interface CellValue {
  score: string;
  comment: string;
}

export const SCORE_HINT = 'Điểm từ 0 đến 10, bước 0.25';

/** '' → null (no score); otherwise a number, NaN when not numeric. */
export const parseScore = (raw: string): number | null => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? null : Number(t);
};
export const scoreInvalid = (raw: string) => {
  const n = parseScore(raw);
  return n !== null && !isValidScore(n);
};

export interface GradeGridProps {
  rows: GradeRow[];
  values: Record<string, CellValue>;
  onChange: (studentId: string, patch: Partial<CellValue>) => void;
  /** No inputs at all (viewers without grades.enter). */
  readOnly: boolean;
  /** Whole sheet frozen (gradebook locked). */
  locked: boolean;
  /** Sheet already confirmed: edits are saved per row with a reason. */
  amend: boolean;
  isDirty: (row: GradeRow) => boolean;
  onAmend: (row: GradeRow) => void;
}

export function GradeGrid({ rows, values, onChange, readOnly, locked, amend, isDirty, onAmend }: GradeGridProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      const next = refs.current.slice(i + 1).find((el) => el && !el.disabled);
      if (next) {
        e.preventDefault();
        next.focus();
      } else if (e.key === 'Enter') e.preventDefault();
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã HV</TableHead>
          <TableHead>Học viên</TableHead>
          <TableHead className="w-32">Điểm</TableHead>
          <TableHead>Nhận xét</TableHead>
          {amend && !readOnly ? <TableHead className="w-28" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const v = values[r.studentId] ?? { score: '', comment: '' };
          const invalid = scoreInvalid(v.score);
          const disabled = locked || r.left;
          return (
            <TableRow key={r.studentId}>
              <TableCell>{r.studentCode}</TableCell>
              <TableCell>
                {r.studentName}
                {r.left ? <span className="ml-2 text-xs text-muted-foreground">Đã rời lớp</span> : null}
              </TableCell>
              {readOnly ? (
                <>
                  <TableCell className="tabular-nums">{r.score ?? '—'}</TableCell>
                  <TableCell>{r.comment ?? ''}</TableCell>
                </>
              ) : (
                <>
                  <TableCell>
                    <Input
                      ref={(el) => { refs.current[i] = el; }}
                      inputMode="decimal"
                      aria-label={`Điểm ${r.studentName}`}
                      aria-invalid={invalid ? true : undefined}
                      title={invalid ? SCORE_HINT : undefined}
                      className={invalid ? 'border-destructive' : undefined}
                      disabled={disabled}
                      value={v.score}
                      onChange={(e) => onChange(r.studentId, { score: e.target.value })}
                      onKeyDown={focusNext(i)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Nhận xét ${r.studentName}`}
                      tabIndex={-1}
                      disabled={disabled}
                      value={v.comment}
                      onChange={(e) => onChange(r.studentId, { comment: e.target.value })}
                    />
                  </TableCell>
                  {amend ? (
                    <TableCell>
                      {!disabled && isDirty(r) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Sửa điểm ${r.studentName}`}
                          disabled={invalid || v.score.trim() === ''}
                          onClick={() => onAmend(r)}
                        >
                          Sửa điểm
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
