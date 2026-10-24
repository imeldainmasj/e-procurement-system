import { Check, Circle, CircleDashed, Clock, SkipForward, X } from 'lucide-react';
import { APPROVAL_STEP_STATUS_LABELS, type ApprovalStepDto } from '@sipita/shared';
import { levelLabel } from '@/utils/approvalRule';
import { formatDateTime } from '@/utils/formatDate';

const icons = {
  APPROVED: <Check className="text-success size-4" />,
  REJECTED: <X className="text-error size-4" />,
  PENDING: <Clock className="text-warning size-4" />,
  WAITING: <Circle className="text-base-content/30 size-4" />,
  SKIPPED: <SkipForward className="text-base-content/40 size-4" />,
} as const;

/** Vertical list of approval levels with who decided, when and why. */
export function ApprovalSteps({ steps }: { steps: ApprovalStepDto[] }) {
  if (steps.length === 0) return <CircleDashed className="size-4" />;
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.id} className="flex gap-3">
          <div className="mt-0.5">{icons[step.status]}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium">
                {step.sequence}. {levelLabel(step.level)}
              </span>
              <span className="text-base-content/60 text-xs">
                {APPROVAL_STEP_STATUS_LABELS[step.status]}
              </span>
            </div>
            {step.approver && (
              <div className="text-base-content/70 text-sm">
                {step.approver.name} · {formatDateTime(step.actedAt)}
              </div>
            )}
            {step.status === 'PENDING' && step.pendingSince && (
              <div className="text-base-content/60 text-xs">
                Menunggu sejak {formatDateTime(step.pendingSince)}
              </div>
            )}
            {step.comment && (
              <div className="bg-base-200 rounded-box mt-1 px-2 py-1 text-sm">{step.comment}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
