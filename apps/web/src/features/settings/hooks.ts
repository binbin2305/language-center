import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from './api';

const KEY = ['settings'];

export const useSettings = () => useQuery({ queryKey: KEY, queryFn: settingsApi.get });

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
