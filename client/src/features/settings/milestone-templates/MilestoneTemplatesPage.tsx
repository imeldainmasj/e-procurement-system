import { Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import {
  EXECUTOR_LABELS,
  EXECUTORS,
  milestoneLabel,
  milestoneTemplateInputSchema,
  MILESTONE_TYPES,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_METHODS,
  type MilestoneTemplateDto,
  type MilestoneTemplateItem,
  type MilestoneType,
  type ProcurementMethod,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { MilestoneTrack } from '@/components/ui/MilestoneTrack';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { useMilestoneTemplates, useReplaceTemplate } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const toItems = (rows: MilestoneTemplateDto[]): MilestoneTemplateItem[] =>
  rows.map(({ type, sequence, executor, prerequisites, isConditional, isActive }) => ({
    type,
    sequence,
    executor,
    prerequisites,
    isConditional,
    isActive,
  }));

function TemplateEditor({
  method,
  rows,
}: {
  method: ProcurementMethod;
  rows: MilestoneTemplateDto[];
}) {
  const replace = useReplaceTemplate();
  const [items, setItems] = useState(() => toItems(rows));
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (i: number, change: Partial<MilestoneTemplateItem>) =>
    setItems((prev) => prev.map((item, j) => (j === i ? { ...item, ...change } : item)));
  const unused = MILESTONE_TYPES.filter((t) => !items.some((item) => item.type === t));

  const save = () => {
    const parsed = milestoneTemplateInputSchema.safeParse({ items });
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    setErrors([]);
    replace.mutate(
      { method, input: parsed.data },
      {
        onSuccess: () => toast.success(`Template ${PROCUREMENT_METHOD_LABELS[method]} disimpan`),
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  // Preview with the same component as the work detail page.
  const preview = items
    .filter((t) => t.isActive)
    .map((t) => ({
      id: t.type,
      type: t.type,
      label: milestoneLabel(t.type, method),
      sequence: t.sequence,
      executor: t.executor,
      status: 'NOT_STARTED' as const,
      isConditional: t.isConditional,
      prerequisites: t.prerequisites,
      missingPrerequisites: t.prerequisites,
      startedAt: null,
      completedAt: null,
      referenceNo: null,
      notes: null,
    }));

  return (
    <div className="space-y-6">
      <SectionCard title="Pratinjau alur" description="Tahap dengan urutan sama berjalan paralel.">
        <MilestoneTrack method={method} milestones={preview} />
      </SectionCard>
      <SectionCard
        title={`Template ${PROCUREMENT_METHOD_LABELS[method]}`}
        description="Perubahan hanya berlaku untuk pekerjaan baru; pekerjaan yang sudah ada tidak berubah."
        flush
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => {
                setItems(toItems(rows));
                setErrors([]);
              }}
            >
              <Undo2 className="size-3" /> Batalkan perubahan
            </button>
            <button
              type="button"
              className="btn btn-xs btn-soft btn-secondary"
              disabled={unused.length === 0}
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  {
                    type: unused[0]!,
                    sequence: Math.max(0, ...prev.map((p) => p.sequence)) + 1,
                    executor: 'IT',
                    prerequisites: [],
                    isConditional: false,
                    isActive: true,
                  },
                ])
              }
            >
              <Plus className="size-3" /> Tambah tahap
            </button>
          </div>
        }
      >
        {errors.length > 0 && (
          <div role="alert" className="alert alert-error alert-soft m-4">
            <ul className="list-disc ps-5 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
              <tr>
                <th>Urutan</th>
                <th>Milestone</th>
                <th>Pelaksana</th>
                <th>Prasyarat</th>
                <th className="text-center">Hanya jika PVP wajib</th>
                <th className="text-center">Aktif</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={item.type}
                  className={cn('hover:bg-base-200/40', !item.isActive && 'opacity-50')}
                >
                  <td>
                    <input
                      type="number"
                      min={1}
                      className="input input-sm w-16"
                      value={item.sequence}
                      onChange={(e) => patch(i, { sequence: Number(e.target.value) })}
                      aria-label="Urutan"
                    />
                  </td>
                  <td>
                    <select
                      className="select select-sm w-48"
                      value={item.type}
                      onChange={(e) => patch(i, { type: e.target.value as MilestoneType })}
                      aria-label="Milestone"
                    >
                      {[item.type, ...unused].map((t) => (
                        <option key={t} value={t}>
                          {milestoneLabel(t, method)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select select-sm w-36"
                      value={item.executor}
                      onChange={(e) =>
                        patch(i, { executor: e.target.value as MilestoneTemplateItem['executor'] })
                      }
                      aria-label="Pelaksana"
                    >
                      {EXECUTORS.map((e) => (
                        <option key={e} value={e}>
                          {EXECUTOR_LABELS[e]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="flex max-w-sm flex-wrap gap-x-3 gap-y-1">
                      {items
                        .filter((other) => other.type !== item.type)
                        .map((other) => (
                          <label key={other.type} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs checkbox-primary"
                              checked={item.prerequisites.includes(other.type)}
                              onChange={(e) =>
                                patch(i, {
                                  prerequisites: e.target.checked
                                    ? [...item.prerequisites, other.type]
                                    : item.prerequisites.filter((p) => p !== other.type),
                                })
                              }
                            />
                            {milestoneLabel(other.type, method)}
                          </label>
                        ))}
                    </div>
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={item.isConditional}
                      onChange={(e) => patch(i, { isConditional: e.target.checked })}
                      aria-label="Kondisional PVP"
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-success"
                      checked={item.isActive}
                      onChange={(e) => patch(i, { isActive: e.target.checked })}
                      aria-label="Aktif"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Hapus ${milestoneLabel(item.type, method)}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-base-300 flex justify-end border-t p-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={replace.isPending}
            onClick={save}
          >
            {replace.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Save className="size-4" />
            )}
            Simpan Template
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

export function MilestoneTemplatesPage() {
  const templates = useMilestoneTemplates();
  const [method, setMethod] = useState<ProcurementMethod>('TENDER');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template Milestone"
        description="Urutan tahapan yang dibentuk otomatis untuk setiap pekerjaan baru, per metode pengadaan."
      />
      <div role="tablist" className="tabs tabs-border">
        {PROCUREMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            className={cn('tab', method === m && 'tab-active')}
            onClick={() => setMethod(m)}
          >
            {PROCUREMENT_METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      {templates.isPending ? (
        <div className="skeleton h-96 w-full" />
      ) : templates.isError ? (
        <div role="alert" className="alert alert-error">
          <span>{getErrorMessage(templates.error)}</span>
        </div>
      ) : (
        <TemplateEditor
          // Remount after a save so the editor starts from the stored template.
          key={`${method}-${templates.dataUpdatedAt}`}
          method={method}
          rows={templates.data.filter((t) => t.method === method)}
        />
      )}
    </div>
  );
}
