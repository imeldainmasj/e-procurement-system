import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Lock,
  MinusCircle,
} from 'lucide-react';
import {
  EXECUTOR_LABELS,
  milestoneLabel,
  type ProcurementMethod,
  type WorkMilestoneDto,
} from '@sipita/shared';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';

interface MilestoneTrackProps {
  method: ProcurementMethod;
  milestones: WorkMilestoneDto[];
  /** Opens the milestone editor; omitted when the user may not edit. */
  onSelect?: (milestone: WorkMilestoneDto) => void;
}

function NodeIcon({ m, locked }: { m: WorkMilestoneDto; locked: boolean }) {
  if (m.status === 'DONE') return <CircleCheck className="text-success size-4" />;
  if (m.status === 'NOT_APPLICABLE') return <MinusCircle className="text-base-content/40 size-4" />;
  if (locked) return <Lock className="text-base-content/40 size-4" />;
  if (m.status === 'IN_PROGRESS') return <CircleDot className="text-warning size-4" />;
  return <CircleDashed className="text-primary size-4" />;
}

/**
 * Milestones grouped by sequence; milestones sharing a sequence run in parallel and are
 * stacked in one column (CLAUDE.md §5.4, §9). Locked nodes show what they wait for.
 */
export function MilestoneTrack({ method, milestones, onSelect }: MilestoneTrackProps) {
  const columns = [...new Set(milestones.map((m) => m.sequence))]
    .sort((a, b) => a - b)
    .map((seq) => milestones.filter((m) => m.sequence === seq));

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
      {columns.map((column, i) => (
        <div key={column[0]!.sequence} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="text-base-content/30 size-4 shrink-0" />}
          <div className="flex flex-col justify-center gap-2">
            {column.map((m) => {
              const locked = m.missingPrerequisites.length > 0 && m.status !== 'DONE';
              const current = !locked && (m.status === 'NOT_STARTED' || m.status === 'IN_PROGRESS');
              const waiting = m.missingPrerequisites
                .map((t) => milestoneLabel(t, method))
                .join(', ');
              const content = (
                <>
                  <div className="flex items-center gap-1.5">
                    <NodeIcon m={m} locked={locked} />
                    <span className="truncate text-sm font-medium">{m.label}</span>
                  </div>
                  <div className="text-base-content/60 mt-0.5 text-xs">
                    {EXECUTOR_LABELS[m.executor]}
                  </div>
                  <div className="mt-1 text-xs">
                    {m.status === 'DONE' && <span>Selesai {formatDate(m.completedAt)}</span>}
                    {m.status === 'IN_PROGRESS' && (
                      <span className="text-warning">Berjalan sejak {formatDate(m.startedAt)}</span>
                    )}
                    {m.status === 'NOT_APPLICABLE' && (
                      <span className="text-base-content/50">Tidak berlaku</span>
                    )}
                    {locked && m.status === 'NOT_STARTED' && (
                      <span className="text-base-content/50">Menunggu {waiting}</span>
                    )}
                    {current && m.status === 'NOT_STARTED' && (
                      <span className="text-primary">Siap dimulai</span>
                    )}
                  </div>
                </>
              );
              const className = cn(
                'bg-base-100 w-44 rounded border px-3 py-2 text-left',
                m.status === 'DONE' && 'border-success/50',
                m.status === 'IN_PROGRESS' && 'border-warning',
                m.status === 'NOT_APPLICABLE' && 'border-base-300 border-dashed opacity-60',
                m.status === 'NOT_STARTED' && (current ? 'border-primary' : 'border-base-300'),
                locked && 'bg-base-200/60',
              );
              const title = locked ? `Menunggu ${waiting} selesai` : undefined;
              return onSelect && m.status !== 'NOT_APPLICABLE' ? (
                <button
                  key={m.id}
                  type="button"
                  className={cn(className, 'hover:bg-base-200/40 cursor-pointer')}
                  onClick={() => onSelect(m)}
                  title={title}
                >
                  {content}
                </button>
              ) : (
                <div key={m.id} className={className} title={title}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
