import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { AssessmentType, GradeClass, type ResultDto } from '@lc/shared';

const GRADE_CLASS_LABEL: Record<GradeClass, string> = {
  [GradeClass.EXCELLENT]: 'Xuất sắc',
  [GradeClass.GOOD]: 'Giỏi',
  [GradeClass.FAIR]: 'Khá',
  [GradeClass.AVERAGE]: 'Trung bình',
  [GradeClass.FAIL]: 'Yếu',
};

const TYPE_LABEL: Record<AssessmentType, string> = {
  [AssessmentType.QUIZ]: 'Kiểm tra ngắn',
  [AssessmentType.MIDTERM]: 'Giữa kỳ',
  [AssessmentType.FINAL]: 'Cuối kỳ',
  [AssessmentType.SKILL]: 'Kỹ năng',
};

export interface TranscriptInput {
  student: { code: string; fullName: string };
  cls: { code: string; name: string };
  result: ResultDto;
}

/** Text/table-only transcript (PdfService denies URL and image access). */
export function buildTranscript({ student, cls, result }: TranscriptInput): TDocumentDefinitions {
  const bold = (text: string) => ({ text, bold: true });
  return {
    content: [
      { text: 'PHIẾU ĐIỂM', fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
      { text: `Học viên: ${student.fullName}` },
      { text: `Mã học viên: ${student.code}` },
      { text: `Lớp: ${cls.name}` },
      { text: `Mã lớp: ${cls.code}`, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [bold('Bài đánh giá'), bold('Loại'), bold('Trọng số (%)'), bold('Điểm')],
            ...result.items.map((i) => [i.name, TYPE_LABEL[i.type] ?? i.type, String(i.weight), String(i.score ?? '')]),
          ],
        },
      },
      { text: `Điểm trung bình: ${result.average ?? '-'}`, margin: [0, 12, 0, 0] },
      { text: `Xếp loại: ${result.gradeClass ? GRADE_CLASS_LABEL[result.gradeClass] : '-'}` },
      { text: `Kết quả: ${result.passed === null ? '-' : result.passed ? 'Đạt' : 'Không đạt'}` },
    ],
  };
}
