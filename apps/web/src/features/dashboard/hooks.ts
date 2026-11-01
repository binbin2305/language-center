import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from './api';

export const useDashboard = () =>
  useQuery({ queryKey: ['reports', 'dashboard'], queryFn: dashboardApi.get });
