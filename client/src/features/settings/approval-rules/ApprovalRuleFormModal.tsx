import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  APPROVAL_LEVEL_LABELS,
  type ApprovalRuleDto,
  type ApprovalRuleInput,
  approvalRuleInputSchema,
  type ApprovalRulePayload,
} from '@sipita/shared';
import { CheckboxGroup } from '@/components/ui/CheckboxGroup';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { approvalRuleHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  rule: ApprovalRuleDto | null;
  onClose: () => void;
}

const levelOptions = Object.entries(APPROVAL_LEVEL_LABELS).map(([level, label]) => ({
  value: Number(level),
  label: `Level ${level} — ${label}`,
}));

export function ApprovalRuleFormModal({ rule, onClose }: Props) {
  const create = approvalRuleHooks.useCreate();
  const update = approvalRuleHooks.useUpdate();
  const mutation = rule ? update : create;

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ApprovalRuleInput, unknown, ApprovalRulePayload>({
    resolver: zodResolver(approvalRuleInputSchema),
    defaultValues: {
      name: rule?.name ?? '',
      minAmount: rule ? Number(rule.minAmount) : 0,
      minInclusive: rule?.minInclusive ?? true,
      maxAmount: rule?.maxAmount ? Number(rule.maxAmount) : null,
      maxInclusive: rule?.maxInclusive ?? false,
      levels: rule?.levels ?? [1],
      isActive: rule?.isActive ?? true,
    },
  });

  const unbounded = useWatch({ control, name: 'maxAmount' }) === null;

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(rule ? 'Aturan approval diperbarui' : 'Aturan approval ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (rule) update.mutate({ id: rule.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={rule ? 'Ubah Aturan Approval' : 'Tambah Aturan Approval'}>
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <FormField label="Nama Aturan" required error={errors.name?.message}>
          <input
            className="input w-full"
            {...register('name')}
            placeholder="mis. Rp10 juta – Rp50 juta"
            autoFocus
          />
        </FormField>

        <FormField label="Batas Bawah" required error={errors.minAmount?.message}>
          <div className="flex gap-2">
            <Controller
              control={control}
              name="minInclusive"
              render={({ field }) => (
                <select
                  className="select w-24"
                  value={field.value ? 'gte' : 'gt'}
                  onChange={(e) => field.onChange(e.target.value === 'gte')}
                  aria-label="Operator batas bawah"
                >
                  <option value="gte">≥</option>
                  <option value="gt">&gt;</option>
                </select>
              )}
            />
            <Controller
              control={control}
              name="minAmount"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value as number | null}
                  onChange={(v) => field.onChange(v ?? 0)}
                  aria-label="Nominal batas bawah"
                />
              )}
            />
          </div>
        </FormField>

        <FormField label="Batas Atas" error={errors.maxAmount?.message}>
          <label className="mb-2 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={unbounded}
              onChange={(e) =>
                setValue('maxAmount', e.target.checked ? null : 0, { shouldValidate: true })
              }
            />
            <span className="text-sm">Tanpa batas atas</span>
          </label>
          {!unbounded && (
            <div className="flex gap-2">
              <Controller
                control={control}
                name="maxInclusive"
                render={({ field }) => (
                  <select
                    className="select w-24"
                    value={field.value ? 'lte' : 'lt'}
                    onChange={(e) => field.onChange(e.target.value === 'lte')}
                    aria-label="Operator batas atas"
                  >
                    <option value="lt">&lt;</option>
                    <option value="lte">≤</option>
                  </select>
                )}
              />
              <Controller
                control={control}
                name="maxAmount"
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value as number | null}
                    onChange={(v) => field.onChange(v ?? 0)}
                    aria-label="Nominal batas atas"
                  />
                )}
              />
            </div>
          )}
        </FormField>

        <FormField label="Level Approval (berurutan)" required error={errors.levels?.message}>
          <Controller
            control={control}
            name="levels"
            render={({ field }) => (
              <CheckboxGroup
                name="levels"
                options={levelOptions}
                value={field.value as number[]}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>

        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-success toggle-sm"
            {...register('isActive')}
          />
          <span className="text-sm">Aktif</span>
        </label>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
