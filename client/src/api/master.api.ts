import type {
  ApiSuccess,
  DepartmentDto,
  DepartmentInput,
  DirectorateDto,
  DirectorateInput,
  DivisionDto,
  DivisionInput,
  ResetPasswordInput,
  UserCreateInput,
  UserDto,
  UserOptionDto,
  UserUpdateInput,
} from '@sipita/shared';
import { api } from './client';
import { createResourceApi } from './resource';

export const directoratesApi = createResourceApi<DirectorateDto, DirectorateInput>('/directorates');
export const divisionsApi = createResourceApi<DivisionDto, DivisionInput>('/divisions');
export const departmentsApi = createResourceApi<DepartmentDto, DepartmentInput>('/departments');

export const usersApi = {
  ...createResourceApi<UserDto, UserCreateInput | UserUpdateInput>('/users'),
  async options(): Promise<UserOptionDto[]> {
    return (await api.get<ApiSuccess<UserOptionDto[]>>('/users/options')).data.data;
  },
  async resetPassword(id: string, input: ResetPasswordInput): Promise<void> {
    await api.post(`/users/${id}/reset-password`, input);
  },
};
