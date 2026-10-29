import type { SettingsDto, UpdateSettingsInput } from '@lc/shared';
import { apiGet, apiPatch } from '@/lib/api';

export const settingsApi = {
  get: () => apiGet<SettingsDto>('settings'),
  update: (input: UpdateSettingsInput) => apiPatch<SettingsDto>('settings', input),
};
