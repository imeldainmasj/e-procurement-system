import {
  ArrowRight,
  FilePen,
  FilePlus2,
  FileX2,
  MessageSquareText,
  Paperclip,
  Upload,
  UserRoundCog,
} from 'lucide-react';
import { useState } from 'react';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type WorkHistoryItemDto,
  type WorkUpdateDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useWorkHistory } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';
import { downloadAttachment } from '@/utils/attachments';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatDate';

/** Body of one progress note (Log Update and Riwayat Perubahan). */
export function UpdateNote({ update: u }: { update: WorkUpdateDto }) {
  return (
    <>
      <div className="text-base-content/60 text-xs">
        {formatDateTime(u.createdAt)} · {u.author.name}
        {u.milestone && ` · ${u.milestone.label}`}
      </div>
      {u.statusFrom && u.statusTo && (
        <div className="mt-0.5 flex items-center gap-1 text-xs">
          <StatusBadge status={u.statusFrom} kind="milestone" />
          <ArrowRight className="size-3" />
          <StatusBadge status={u.statusTo} kind="milestone" />
        </div>
      )}
      <p className="text-sm whitespace-pre-line">{u.note}</p>
      {u.attachment && (
        <button
          type="button"
          className="link link-primary flex items-center gap-1 text-xs"
          onClick={() =>
            downloadAttachment(u.attachment!.id, u.attachment!.fileName).catch((err) =>
              toast.error(getErrorMessage(err)),
            )
          }
        >
          <Paperclip className="size-3" /> {u.attachment.fileName}
        </button>
      )}
    </>
  );
}

type AuditItem = Extract<WorkHistoryItemDto, { kind: 'AUDIT' }>;

const ACTION_ICON = {
  CREATE: FilePlus2,
  DELETE: FileX2,
  REASSIGN: UserRoundCog,
} as const;

function AuditEntry({ item }: { item: AuditItem }) {
  const Icon = ACTION_ICON[item.action as keyof typeof ACTION_ICON] ?? FilePen;
  const isDiff = item.action !== 'CREATE' && item.action !== 'DELETE';
  return (
    <>
      <div className="text-base-content/60 flex flex-wrap items-center gap-x-1 text-xs">
        {formatDateTime(item.createdAt)} · {item.user?.name ?? 'Sistem'}
        {item.source === 'IMPORT' && (
          <span className="badge badge-xs badge-soft badge-info gap-1">
            <Upload className="size-3" /> Import
          </span>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-sm">
        <Icon className="text-base-content/60 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{AUDIT_ENTITY_LABELS[item.entity] ?? item.entity}</span>
          {item.subject && <span className="font-mono text-xs"> {item.subject}</span>}{' '}
          <span className="text-base-content/70">
            {AUDIT_ACTION_LABELS[item.action].toLowerCase()}
          </span>
        </span>
      </p>
      {item.changes.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {item.changes.map((c) => (
            <div key={c.field} className="contents">
              <dt className="text-base-content/60">{c.label}</dt>
              <dd className="min-w-0 break-words">
                {isDiff && (
                  <>
                    <span className="text-base-content/60 line-through">{c.before ?? '—'}</span>
                    <ArrowRight className="mx-1 inline size-3" aria-label="menjadi" />
                  </>
                )}
                <span>{c.after ?? '—'}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/** Progress notes and audited changes of the work and its documents, newest first. */
export function WorkHistory({ workId }: { workId: string }) {
  const [page, setPage] = useState(1);
  const history = useWorkHistory(workId, page, true);
  const total = history.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  if (history.isPending) return <div className="skeleton h-32 w-full" />;
  if (history.error)
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(history.error)}</span>
      </div>
    );
  if (total === 0) return <EmptyState title="Belum ada riwayat" />;

  const items = history.data!.data;
  return (
    <>
      <ul className="timeline timeline-vertical timeline-compact timeline-snap-icon">
        {items.map((item, i) => (
          <li key={`${item.kind}-${item.id}`}>
            {i > 0 && <hr className="bg-base-300" />}
            <div className="timeline-middle">
              {item.kind === 'UPDATE' ? (
                <MessageSquareText className="text-primary size-4" aria-label="Catatan progres" />
              ) : (
                <span
                  className={cn(
                    'block size-2 rounded-full',
                    item.action === 'DELETE' ? 'bg-error' : 'bg-base-content/40',
                  )}
                />
              )}
            </div>
            <div className="timeline-end mb-4 w-full">
              {item.kind === 'UPDATE' ? (
                <UpdateNote update={item.update} />
              ) : (
                <AuditEntry item={item} />
              )}
            </div>
            {i < items.length - 1 && <hr className="bg-base-300" />}
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className="join mt-2">
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <span className="join-item btn btn-sm btn-disabled">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
