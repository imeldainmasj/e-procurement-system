import { Check, FileDown, FileText, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { canActOnStep, hasAnyRole, MEMO_STATUS_LABELS, type PrDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { memosApi } from '@/api/approvals.api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { downloadBlob, pdfFileName } from '@/utils/download';
import {
  ApprovalDecisionDialogs,
  type DecisionTarget,
} from '../../approvals/ApprovalDecisionDialogs';
import { ApprovalSteps } from '../../approvals/ApprovalSteps';

/** Memo + approval levels on the PR detail, with approve/reject for the current approver. */
export function PrApprovalPanel({ pr }: { pr: PrDto }) {
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const memo = pr.memo;
  if (!memo || !user) return null;

  const pending = memo.steps.find((s) => s.status === 'PENDING');
  const canDecide =
    pending !== undefined &&
    canActOnStep(
      { level: pending.level, status: pending.status, requesterId: pr.requester.id },
      user,
    );
  const target: DecisionTarget | null = pending
    ? {
        stepId: pending.id,
        level: pending.level,
        prNumber: pr.number,
        prTitle: pr.title,
        total: pr.estimatedTotal,
      }
    : null;
  const canOpenMemoPage = hasAnyRole(user.roles, ['PROCUREMENT', 'APPROVER']);

  const download = async () => {
    setDownloading(true);
    try {
      downloadBlob(await memosApi.pdf(memo.id), pdfFileName(memo.number));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title text-base">Approval</h2>
          <StatusBadge status={memo.status} label={MEMO_STATUS_LABELS[memo.status]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FileText className="size-4 opacity-60" />
          {canOpenMemoPage ? (
            <Link to={`/memo/${memo.id}`} className="link link-hover font-mono">
              {memo.number}
            </Link>
          ) : (
            <span className="font-mono">{memo.number}</span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => void download()}
            disabled={downloading}
          >
            {downloading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <FileDown className="size-3" />
            )}{' '}
            PDF
          </button>
        </div>
        <ApprovalSteps steps={memo.steps} />
        {canDecide && (
          <div className="border-base-300 flex gap-2 border-t pt-3">
            <button
              type="button"
              className="btn btn-success btn-sm flex-1"
              onClick={() => setMode('approve')}
            >
              <Check className="size-4" /> Setujui
            </button>
            <button
              type="button"
              className="btn btn-error btn-outline btn-sm flex-1"
              onClick={() => setMode('reject')}
            >
              <X className="size-4" /> Tolak
            </button>
          </div>
        )}
      </div>
      <ApprovalDecisionDialogs target={target} mode={mode} onClose={() => setMode(null)} />
    </div>
  );
}
