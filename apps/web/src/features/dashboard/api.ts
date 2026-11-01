import type { DashboardDto } from '@lc/shared';
import { apiGet } from '@/lib/api';

export const dashboardApi = {
  get: () => apiGet<DashboardDto>('reports/dashboard'),
};
