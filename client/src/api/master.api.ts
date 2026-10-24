import type {
  ApiSuccess,
  ApprovalRuleDto,
  ApprovalRuleInput,
  ApprovalRuleListResult,
  DivisionDto,
  DivisionInput,
  ItemCategoryDto,
  ItemCategoryInput,
  ItemDto,
  ItemInput,
  ResetPasswordInput,
  UserCreateInput,
  UserDto,
  UserUpdateInput,
  WarehouseDto,
  WarehouseInput,
} from '@sipita/shared';
import { api } from './client';
import { createResourceApi } from './resource';

export const divisionsApi = createResourceApi<DivisionDto, DivisionInput>('/divisions');
export const itemCategoriesApi = createResourceApi<ItemCategoryDto, ItemCategoryInput>(
  '/item-categories',
);
export const itemsApi = createResourceApi<ItemDto, ItemInput>('/items');
export const warehousesApi = createResourceApi<WarehouseDto, WarehouseInput>('/warehouses');

export const usersApi = {
  ...createResourceApi<UserDto, UserCreateInput | UserUpdateInput>('/users'),
  async resetPassword(id: string, input: ResetPasswordInput): Promise<void> {
    await api.post(`/users/${id}/reset-password`, input);
  },
};

export const approvalRulesApi = {
  ...createResourceApi<ApprovalRuleDto, ApprovalRuleInput>('/approval-rules'),
  async listAll(): Promise<ApprovalRuleListResult> {
    return (await api.get<ApiSuccess<ApprovalRuleListResult>>('/approval-rules')).data.data;
  },
  async resolve(amount: number): Promise<{ rule: ApprovalRuleDto; levels: number[] }> {
    const res = await api.get<ApiSuccess<{ rule: ApprovalRuleDto; levels: number[] }>>(
      '/approval-rules/resolve',
      { params: { amount } },
    );
    return res.data.data;
  },
};
