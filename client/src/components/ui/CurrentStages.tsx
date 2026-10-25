import { EXECUTOR_LABELS, type StageDto } from '@sipita/shared';

/**
 * The work's current stage(s). Stages waiting on someone outside IT (other team, directors,
 * officials) are marked with who they wait for (CLAUDE.md §10, Monitoring Tim).
 */
export function CurrentStages({ work }: { work: { currentStages: StageDto[] } }) {
  if (work.currentStages.length === 0) return <span className="text-base-content/50">-</span>;
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {work.currentStages.map((s) => (
        <span
          key={s.type}
          className={`badge badge-sm badge-soft whitespace-nowrap ${s.executor === 'IT' ? 'badge-primary' : 'badge-info'}`}
          title={s.executor === 'IT' ? undefined : `Menunggu ${EXECUTOR_LABELS[s.executor]}`}
        >
          {s.label}
          {s.executor !== 'IT' && ` · ${EXECUTOR_LABELS[s.executor]}`}
        </span>
      ))}
    </div>
  );
}
