import type { ReactNode } from 'react';
import { formatRupiah } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useApprovalDecision } from '@/hooks/useApprovals';
import { toast } from '@/stores/toastStore';
import { levelLabel } from '@/utils/approvalRule';

export interface DecisionTarget {
  stepId: string;
  level: number;
  prNumber: string | null;
  prTitle: string;
  total: string;
}

interface Props {
  target: DecisionTarget | null;
  mode: 'approve' | 'reject' | null;
  onClose: () => void;
}

/** Approve (optional comment) and reject (mandatory reason) confirmations for one step. */
export function ApprovalDecisionDialogs({ target, mode, onClose }: Props) {
  const { approve, reject } = useApprovalDecision();
  const summary: ReactNode = target && (
    <>
      <b>{target.prNumber}</b> — {target.prTitle} ({formatRupiah(target.total)}) sebagai{' '}
      <b>{levelLabel(target.level)}</b>
    </>
  );
  const onError = (err: unknown) => toast.error(getErrorMessage(err));

  return (
    <>
      <ConfirmModal
        open={mode === 'approve' && target !== null}
        onClose={onClose}
        loading={approve.isPending}
        variant="success"
        optionalReason
        reasonLabel="Catatan"
        title="Setujui Pengajuan"
        confirmLabel="Setujui"
        message={<>Setujui {summary}?</>}
        onConfirm={(comment) =>
          target &&
          approve.mutate(
            { stepId: target.stepId, ...(comment && { comment }) },
            {
              onSuccess: (res) =>
                toast.success(
                  res.memo.status === 'APPROVED'
                    ? `${target.prNumber} disetujui penuh dan diteruskan ke Pengadaan`
                    : `${target.prNumber} disetujui, diteruskan ke level berikutnya`,
                ),
              onError,
              onSettled: onClose,
            },
          )
        }
      />
      <ConfirmModal
        open={mode === 'reject' && target !== null}
        onClose={onClose}
        loading={reject.isPending}
        variant="error"
        requireReason
        reasonLabel="Alasan penolakan"
        title="Tolak Pengajuan"
        confirmLabel="Tolak"
        message={
          <>Tolak {summary}? Pengajuan akan berstatus Ditolak dan level berikutnya dibatalkan.</>
        }
        onConfirm={(reason) =>
          target &&
          reject.mutate(
            { stepId: target.stepId, reason: reason ?? '' },
            {
              onSuccess: () => toast.success(`${target.prNumber} ditolak`),
              onError,
              onSettled: onClose,
            },
          )
        }
      />
    </>
  );
}
