import { useQuery } from '@tanstack/react-query';
import type { CourseDto } from '@lc/shared';
import { apiGetPage } from '@/lib/api';

// TODO W1-MERGE: use useCourses from features/courses (L-CATALOG) and delete this file.
export const useCourseOptions = () =>
  useQuery({
    queryKey: ['admissions', 'course-options'],
    queryFn: () => apiGetPage<CourseDto>('courses', { status: 'ACTIVE', limit: 100 }),
    select: (page) => page.data,
  });
