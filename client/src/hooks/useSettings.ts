import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsInput } from '@sipita/shared';
import { settingsApi } from '@/api/settings.api';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60_000 });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => settingsApi.update(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}
