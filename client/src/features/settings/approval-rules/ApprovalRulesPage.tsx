import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ApprovalRuleDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { approvalRulesApi } from '@/api/master.api';
import { ApprovalPath } from '@/components/ui/ApprovalPath';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveBadge } from '@/components/ui/StatusBadge';
import { useDebounce } from '@/hooks/useDebounce';
import { approvalRuleHooks, useApprovalRules } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { describeRuleRange } from '@/utils/approvalRule';
import { ApprovalRuleFormModal } from './ApprovalRuleFormModal';

function Simulator() {
  const [amount, setAmount] = useState<number | null>(null);
  const debounced = useDebounce(amount);
  const result = useQuery({
    queryKey: ['approval-rules', 'resolve', debounced],
    queryFn: () => approvalRulesApi.resolve(debounced!),
    enabled: debounced !== null,
    retry: false,
  });

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3 p-4">
        <h2 className="font-semibold">Simulasi</h2>
        <p className="text-base-content/70 text-sm">
          Masukkan estimasi nilai pengajuan untuk melihat jalur approval-nya.
        </p>
        <CurrencyInput
          value={amount}
          onChange={setAmount}
          aria-label="Nilai simulasi"
          placeholder="0"
        />
        {debounced !== null &&
          (result.isPending ? (
            <span className="loading loading-dots loading-sm" />
          ) : result.isError ? (
            <div role="alert" className="alert alert-warning alert-soft text-sm">
              {getErrorMessage(result.error)}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <div>
                Aturan: <b>{result.data.rule.name}</b>
              </div>
              <ApprovalPath levels={result.data.levels} />
            </div>
          ))}
      </div>
    </div>
  );
}

export function ApprovalRulesPage() {
  const rules = useApprovalRules();
  const remove = approvalRuleHooks.useRemove();
  const [editing, setEditing] = useState<ApprovalRuleDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ApprovalRuleDto | null>(null);

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast.success(`Aturan "${deleting.name}" dihapus`),
      onError: (err) => toast.error(getErrorMessage(err)),
      onSettled: () => setDeleting(null),
    });
  };

  return (
    <>
      <PageHeader
        title="Aturan Approval"
        description="Menentukan level approval berdasarkan estimasi total nilai pengajuan."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setEditing('new')}
          >
            <Plus className="size-4" /> Tambah Aturan
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {rules.data?.warnings.map((warning) => (
            <div key={warning} role="alert" className="alert alert-warning">
              <TriangleAlert className="size-5" />
              <span>{warning}</span>
            </div>
          ))}

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
              {rules.isError ? (
                <div role="alert" className="alert alert-error">
                  <span>{getErrorMessage(rules.error)}</span>
                </div>
              ) : rules.isPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-8 w-full" />
                  ))}
                </div>
              ) : rules.data.rules.length === 0 ? (
                <EmptyState
                  title="Belum ada aturan approval"
                  description="Pengajuan tidak dapat diproses tanpa aturan aktif."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Rentang Nilai</th>
                        <th>Jalur Approval</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.data.rules.map((rule) => (
                        <tr key={rule.id} className={rule.isActive ? '' : 'opacity-60'}>
                          <td className="font-medium">{rule.name}</td>
                          <td className="whitespace-nowrap">{describeRuleRange(rule)}</td>
                          <td>
                            <ApprovalPath levels={rule.levels} />
                          </td>
                          <td>
                            <ActiveBadge active={rule.isActive} />
                          </td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setEditing(rule)}
                                aria-label={`Ubah ${rule.name}`}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-error"
                                onClick={() => setDeleting(rule)}
                                aria-label={`Hapus ${rule.name}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <Simulator />
      </div>

      {editing && (
        <ApprovalRuleFormModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Aturan Approval"
        confirmLabel="Hapus"
        message={
          <>
            Hapus aturan <b>{deleting?.name}</b>? Pengajuan yang sudah berjalan tidak terpengaruh,
            tetapi rentang nilai ini tidak lagi tercakup.
          </>
        }
      />
    </>
  );
}
