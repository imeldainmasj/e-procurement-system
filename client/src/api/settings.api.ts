import type { ApiSuccess, SettingsDto, SettingsInput } from '@sipita/shared';
import { api } from './client';

export const settingsApi = {
  async get(): Promise<SettingsDto> {
    return (await api.get<ApiSuccess<SettingsDto>>('/settings')).data.data;
  },
  async update(input: SettingsInput): Promise<SettingsDto> {
    return (await api.put<ApiSuccess<SettingsDto>>('/settings', input)).data.data;
  },
};
