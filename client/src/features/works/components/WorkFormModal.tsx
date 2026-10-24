import { zodResolver } from '@hookform/resolvers/zod';
import { Info, TriangleAlert } from 'lucide-react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  PK_RESULT_LABELS,
  PK_RESULTS,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_METHODS,
  PROCUREMENT_TYPE_LABELS,
  PROCUREMENT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  toIdr,
  WORK_STATUS_LABELS,
  WORK_STATUSES,
  workCreateSchema,
  type WorkDetailDto,
  type WorkUpdateInput,
  type WorkUpdatePayload,
  workUpdateSchema,
} from '@sipita/shared';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import { useDirectorateOptions, useUserOptions } from '@/hooks/useMasterData';
import { usePermission } from '@/hooks/usePermission';
import { vendorHooks } from '@/hooks/useVendors';
import { useAgreementOptions, useRuleEvaluation, useWorkMutations } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';
import { CURRENCIES } from '@/utils/currencies';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  work: WorkDetailDto | null;
  onClose: () => void;
}

function RulePreview({
  amountIdr,
  previous,
  method,
}: {
  amountIdr: number | null;
  previous: number | null;
  method: string;
}) {
  const evaluation = useRuleEvaluation(useDebounce(amountIdr, 400), useDebounce(previous, 400));
  const r = evaluation.data;
  if (!r || !amountIdr) return null;
  const mismatch = (method === 'TENDER' || method === 'BIDDING') && method !== r.suggestedMethod;
  return (
    <div
      role="status"
      className={`alert alert-soft text-sm ${mismatch ? 'alert-warning' : 'alert-info'}`}
    >
      {mismatch ? <TriangleAlert className="size-4" /> : <Info className="size-4" />}
      <div>
        <div>
          Nilai {formatCurrency(amountIdr)} → saran metode{' '}
          <b>{PROCUREMENT_METHOD_LABELS[r.suggestedMethod]}</b>
          {r.increasePercent !== null &&
            ` · kenaikan ${r.increasePercent.toLocaleString('id-ID')}% dari tahun lalu`}
          {' · '}PVP Forum <b>{r.pvpRequired ? 'wajib' : 'tidak wajib'}</b>
        </div>
        {mismatch && (
          <div className="text-xs">Metode boleh tetap disimpan, tetapi akan ditandai.</div>
        )}
      </div>
    </div>
  );
}

export function WorkFormModal({ work, onClose }: Props) {
  const navigate = useNavigate();
  const { user, isManager, isAdmin } = usePermission();
  const canPickPic = isManager || isAdmin;
  const { create, update } = useWorkMutations();
  const mutation = work ? update : create;
  const users = useUserOptions();
  const directorates = useDirectorateOptions();
  const vendors = vendorHooks.useList({ page: 1, limit: 100, sort: 'name:asc' });

  const resolver = zodResolver(work ? workUpdateSchema : workCreateSchema) as unknown as Resolver<
    WorkUpdateInput,
    unknown,
    WorkUpdatePayload
  >;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<WorkUpdateInput, unknown, WorkUpdatePayload>({
    resolver,
    defaultValues: {
      title: work?.title ?? '',
      procurementType: work?.procurementType ?? 'RENEWAL_LICENSE',
      category: work?.category ?? 'BAU',
      method: work?.method ?? 'BIDDING',
      procurementYear: work?.procurementYear ?? new Date().getFullYear(),
      picId: work?.pic.id ?? user?.id ?? '',
      requesterDirectorateId: work?.requesterDirectorate?.id ?? '',
      vendorId: work?.vendor?.id ?? '',
      amount: work?.amount ?? 0,
      currency: work?.currency ?? 'IDR',
      exchangeRate: work?.exchangeRate ?? 1,
      previousPurchaseAmount: work?.previousPurchaseAmount ?? null,
      periodStart: work?.periodStart ?? '',
      periodEnd: work?.periodEnd ?? '',
      sourceAgreementId: work?.sourceAgreement?.id ?? '',
      pkResult: work?.pkResult ?? '',
      notes: work?.notes ?? '',
      status: work?.status ?? 'ACTIVE',
    },
  });

  const [method, currency, amount, rate, previous] = useWatch({
    control,
    name: ['method', 'currency', 'amount', 'exchangeRate', 'previousPurchaseAmount'],
  });
  const isPk = method === 'SPECIAL_EXTENSION';
  const isIdr = currency === 'IDR';
  const agreements = useAgreementOptions(isPk);
  const amountIdr =
    typeof amount === 'number' && amount > 0 ? toIdr(amount, isIdr ? 1 : Number(rate) || 0) : null;
  const methodLocked = Boolean(
    work?.milestones.some((m) => m.status === 'IN_PROGRESS' || m.status === 'DONE'),
  );

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: (saved: WorkDetailDto) => {
        toast.success(work ? 'Pekerjaan diperbarui' : `Pekerjaan ${saved.code} dibuat`);
        onClose();
        if (!work) navigate(`/pekerjaan/${saved.id}`);
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (work) update.mutate({ id: work.id, input }, options);
    else create.mutate(input, options);
  });

  const currencyOptions = CURRENCIES.includes(currency ?? 'IDR')
    ? CURRENCIES
    : [...CURRENCIES, currency!];

  return (
    <Modal open onClose={onClose} title={work ? `Ubah ${work.code}` : 'Tambah Pekerjaan'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField
            label="Judul Pekerjaan"
            required
            error={errors.title?.message}
            className="md:col-span-3"
          >
            <input
              className="input w-full"
              placeholder="Mis. Renewal License Microsoft 365 E3 2026-2027"
              {...register('title')}
              autoFocus
            />
          </FormField>
          <FormField label="Jenis Pengadaan" required error={errors.procurementType?.message}>
            <select className="select w-full" {...register('procurementType')}>
              {PROCUREMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROCUREMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Kategori" required error={errors.category?.message}>
            <select className="select w-full" {...register('category')}>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PROJECT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tahun Pengadaan" required error={errors.procurementYear?.message}>
            <input type="number" className="input w-full" {...register('procurementYear')} />
          </FormField>
          <FormField
            label="Metode Pengadaan"
            required
            error={errors.method?.message}
            hint={methodLocked ? 'Terkunci: sudah ada milestone yang berjalan' : undefined}
          >
            {methodLocked ? (
              <>
                {/* Disabled inputs are not submitted, so the value travels in a hidden field. */}
                <input type="hidden" {...register('method')} />
                <input
                  className="input w-full"
                  disabled
                  value={PROCUREMENT_METHOD_LABELS[work!.method]}
                />
              </>
            ) : (
              <select className="select w-full" {...register('method')}>
                {PROCUREMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PROCUREMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="PIC" required error={errors.picId?.message}>
            {canPickPic ? (
              <select className="select w-full" {...register('picId')}>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" {...register('picId')} />
                <input
                  className="input w-full"
                  disabled
                  value={work?.pic.name ?? user?.name ?? ''}
                />
              </>
            )}
          </FormField>
          <FormField label="Direktorat Peminta" error={errors.requesterDirectorateId?.message}>
            <select className="select w-full" {...register('requesterDirectorateId')}>
              <option value="">—</option>
              {directorates.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Vendor" error={errors.vendorId?.message} className="md:col-span-3">
            <select className="select w-full" {...register('vendorId')}>
              <option value="">— Belum ditentukan —</option>
              {vendors.data?.data.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Mata Uang" required error={errors.currency?.message}>
            <select className="select w-full" {...register('currency')}>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Nilai" required error={errors.amount?.message}>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <CurrencyInput
                  currency={currency}
                  value={field.value as number | null}
                  onChange={(v) => field.onChange(v ?? 0)}
                  error={Boolean(errors.amount)}
                />
              )}
            />
          </FormField>
          {isIdr ? (
            <div className="hidden md:block" />
          ) : (
            <FormField
              label="Kurs ke IDR"
              required
              error={errors.exchangeRate?.message}
              hint={amountIdr ? `= ${formatCurrency(amountIdr)}` : undefined}
            >
              <input
                type="number"
                step="0.01"
                min={0}
                className="input w-full"
                {...register('exchangeRate')}
              />
            </FormField>
          )}
          <FormField
            label="Nilai Pembelian Tahun Sebelumnya (IDR)"
            error={errors.previousPurchaseAmount?.message}
            hint="Kosongkan untuk pengadaan baru"
            className="md:col-span-2"
          >
            <Controller
              control={control}
              name="previousPurchaseAmount"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value as number | null}
                  onChange={field.onChange}
                  error={Boolean(errors.previousPurchaseAmount)}
                />
              )}
            />
          </FormField>
          <div className="md:col-span-3">
            <RulePreview
              amountIdr={amountIdr}
              previous={typeof previous === 'number' ? previous : null}
              method={method ?? ''}
            />
          </div>

          <FormField label="Periode Mulai" error={errors.periodStart?.message}>
            <input type="date" className="input w-full" {...register('periodStart')} />
          </FormField>
          <FormField label="Periode Selesai" error={errors.periodEnd?.message}>
            <input type="date" className="input w-full" {...register('periodEnd')} />
          </FormField>
          {work ? (
            <FormField label="Status" required error={errors.status?.message}>
              <select className="select w-full" {...register('status')}>
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WORK_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <div className="hidden md:block" />
          )}

          {isPk && (
            <>
              <FormField
                label="Kontrak Sumber (PK)"
                required
                error={errors.sourceAgreementId?.message}
                className="md:col-span-2"
                hint="Kontrak yang masih aktif dan akan diperpanjang"
              >
                <select className="select w-full" {...register('sourceAgreementId')}>
                  <option value="">— Pilih kontrak —</option>
                  {work?.sourceAgreement &&
                    !agreements.data?.some((a) => a.id === work.sourceAgreement!.id) && (
                      <option value={work.sourceAgreement.id}>
                        {work.sourceAgreement.agreementNo} — {work.sourceAgreement.title}
                      </option>
                    )}
                  {agreements.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agreementNo} — {a.title} ({a.vendorName}, s.d. {formatDate(a.periodEnd)})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Hasil PK"
                error={errors.pkResult?.message}
                hint="Sesuai keputusan di luar sistem"
              >
                <select className="select w-full" {...register('pkResult')}>
                  <option value="">— Belum diputuskan —</option>
                  {PK_RESULTS.map((r) => (
                    <option key={r} value={r}>
                      {PK_RESULT_LABELS[r]}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          <FormField label="Catatan" error={errors.notes?.message} className="md:col-span-3">
            <textarea className="textarea w-full" rows={2} {...register('notes')} />
          </FormField>
        </div>

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
