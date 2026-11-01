import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ResultDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { EntitySelect } from '@/components/common/entity-select';
import { OptionSelect } from '@/components/common/option-select';
import { PageHeader } from '@/components/common/page-header';
import { useClasses } from '@/features/classes/hooks';
import { GradeClassBadge, formatScore } from '../components/grade-class-badge';
import { useResults } from '../hooks';

const LIMIT = 20;

export default function ResultsPage() {
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [page, setPage] = useState(1);
  const classes = useClasses({ limit: 100 });
  const q = useResults({
    classId: classId || undefined,
    courseId: courseId || undefined,
    studentId: studentId || undefined,
    page,
    limit: LIMIT,
  });
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);

  const columns = useMemo<ColumnDef<ResultDto>[]>(() => {
    const assessments = new Map<string, string>();
    rows.forEach((r) => r.items.forEach((i) => assessments.set(i.assessmentId, i.name)));
    return [
      {
        id: 'student',
        header: 'Học viên',
        cell: ({ row }) => row.original.studentName ?? row.original.studentId,
      },
      {
        id: 'class',
        header: 'Lớp',
        cell: ({ row }) => {
          const r = row.original;
          return r.classCode
            ? `${r.classCode}${r.className ? ` - ${r.className}` : ''}`
            : r.classId;
        },
      },
      ...[...assessments].map(([id, name]): ColumnDef<ResultDto> => ({
        id: `a-${id}`,
        header: name,
        cell: ({ row }) =>
          formatScore(row.original.items.find((i) => i.assessmentId === id)?.score),
      })),
      { id: 'average', header: 'Trung bình', cell: ({ row }) => formatScore(row.original.average) },
      {
        id: 'gradeClass',
        header: 'Xếp loại',
        cell: ({ row }) => <GradeClassBadge value={row.original.gradeClass} />,
      },
    ];
  }, [rows]);

  return (
    <section>
      <PageHeader title="Kết quả học tập" />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <OptionSelect
            aria-label="Lớp"
            allLabel="Tất cả lớp"
            value={classId}
            onValueChange={(v) => {
              setClassId(v);
              setPage(1);
            }}
            options={(classes.data?.data ?? []).map((c) => ({
              value: c.id,
              label: `${c.code} - ${c.name}`,
            }))}
          />
        </div>
        <div className="w-full max-w-xs">
          <EntitySelect
            entity="course"
            aria-label="Khóa học"
            placeholder="Tất cả khóa"
            value={courseId || null}
            onChange={(id) => {
              setCourseId(id ?? '');
              setPage(1);
            }}
          />
        </div>
        <div className="w-full max-w-xs">
          <EntitySelect
            entity="student"
            aria-label="Học viên"
            placeholder="Tất cả học viên"
            value={studentId || null}
            onChange={(id) => {
              setStudentId(id ?? '');
              setPage(1);
            }}
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        total={q.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        getRowId={(r) => `${r.studentId}-${r.classId}`}
        empty={{ title: 'Chưa có kết quả học tập' }}
      />
    </section>
  );
}
