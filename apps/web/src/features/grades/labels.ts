import type { AssessmentType, GradeClass } from '@lc/shared';

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  QUIZ: 'Kiểm tra nhanh',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  SKILL: 'Kỹ năng',
};

/** FR-GRD-05 grade classification badges. */
export const GRADE_CLASS_LABELS: Record<GradeClass, string> = {
  EXCELLENT: 'Xuất sắc',
  GOOD: 'Giỏi',
  FAIR: 'Khá',
  AVERAGE: 'Trung bình',
  FAIL: 'Không đạt',
};
