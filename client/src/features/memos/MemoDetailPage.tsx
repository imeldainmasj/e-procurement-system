import { ArrowLeft, FileDown } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatRupiah, MEMO_STATUS_LABELS } from '@sipita/shared';
import { memosApi } from '@/api/approvals.api';
import { getErrorMessage } from '@/api/client';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useMemoDetail } from '@/hooks/useApprovals';
import { usePdfUrl } from '@/hooks/usePdfUrl';
import { downloadBlob, pdfFileName } from '@/utils/download';
import { formatDate } from '@/utils/formatDate';
import { ApprovalSteps } from '../approvals/ApprovalSteps';

export function MemoDetailPage() {
  const { id } = useParams();
  const memo = useMemoDetail(id);
  // Re-render the PDF whenever an approval step changes.
  const version = memo.data?.steps.map((s) => s.status).join(',');
  const pdf = usePdfUrl(['memos', id, 'pdf', version], () => memosApi.pdf(id!), Boolean(id));

  if (memo.isPending) return <div className="skeleton h-96 w-full" />;
  if (memo.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(memo.error)}</span>
      </div>
    );
  }
  const m = memo.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/memo"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar memo
          </Link>
          <h1 className="text-lg font-semibold">{m.subject}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{m.number}</span>
            <StatusBadge status={m.status} label={MEMO_STATUS_LABELS[m.status]} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-soft btn-primary btn-sm"
          disabled={!pdf.blob}
          onClick={() => pdf.blob && downloadBlob(pdf.blob, pdfFileName(m.number))}
        >
          <FileDown className="size-4" /> Unduh PDF
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard title="Pratinjau Dokumen" className="xl:col-span-2" flush bodyClassName="p-2">
          {pdf.error ? (
            <div role="alert" className="alert alert-error">
              <span>{getErrorMessage(pdf.error)}</span>
            </div>
          ) : pdf.url ? (
            <iframe
              title={`Pratinjau ${m.number}`}
              src={pdf.url}
              className="rounded-box h-[75vh] w-full"
            />
          ) : (
            <div className="skeleton h-[75vh] w-full" />
          )}
        </SectionCard>
        <div className="space-y-6">
          <SectionCard title="Detail Memo" bodyClassName="space-y-2 text-sm">
            <div>
              <span className="text-base-content/60">Pengajuan: </span>
              <Link to={`/pengajuan/${m.pr.id}`} className="link font-mono">
                {m.pr.number}
              </Link>
            </div>
            <div>
              <span className="text-base-content/60">Pemohon: </span>
              {m.requester.name} ({m.division.name})
            </div>
            <div>
              <span className="text-base-content/60">Nilai: </span>
              <b>{formatRupiah(m.totalAmount)}</b>
            </div>
            <div>
              <span className="text-base-content/60">Dibuat: </span>
              {formatDate(m.createdAt)}
            </div>
          </SectionCard>
          <SectionCard title="Persetujuan">
            <ApprovalSteps steps={m.steps} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
