import { useQuery } from '@tanstack/react-query';
import { vnDay } from '@lc/shared';
import { ApiError } from '@/lib/api';
import { homeApi } from './api';

const KEY = 'home';
const noRetryOnApiError = (count: number, e: unknown) => !(e instanceof ApiError) && count < 2;

export const useSessionsBetween = (from: string, to: string) =>
  useQuery({ queryKey: [KEY, 'sessions', from, to], queryFn: () => homeApi.sessions(from, to), retry: noRetryOnApiError });

export const useUpcomingPlacementTests = (fromIso: string) =>
  useQuery({ queryKey: [KEY, 'placement', vnDay(new Date(fromIso))], queryFn: () => homeApi.upcomingPlacementTests(fromIso), retry: noRetryOnApiError });

export const useMyAttendanceSummary = () =>
  useQuery({ queryKey: [KEY, 'attendance'], queryFn: homeApi.attendanceSummary, retry: noRetryOnApiError });

export const useMyResults = () =>
  useQuery({ queryKey: [KEY, 'results'], queryFn: homeApi.results, retry: noRetryOnApiError });

export const useMyInvoices = () =>
  useQuery({ queryKey: [KEY, 'invoices'], queryFn: homeApi.invoices, retry: noRetryOnApiError });
