import type { ColumnDef } from '@tanstack/react-table';
import { Download, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IMPORT_PHASE_LABELS, type ImportBatchDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { importsApi } from '@/api/imports.api';
import { Can } from '@/components/auth/Can';
import { DataTable } from '@/components/ui/DataTable';
import { FileUpload } from '@/components/ui/FileUpload';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useImportBatches, useImportMutation } from '@/hooks/useImports';
import { useListParams } from '@/hooks/useListParams';
import { toast } from '@/stores/toastStore';
import { downloadBlob } from '@/utils/download';
import { formatDateTime } from '@/utils/formatDate';

export function BatchStatus({ batch }: { batch: ImportBatchDto }) {
  if (batch.phase) {
    return (
      <span className="badge badge-sm badge-soft badge-info gap-1 whitespace-nowrap">
        <span className="loading loading-spinner loading-xs" />
        {IMPORT_PHASE_LABELS[batch.phase]}
        {batch.progress ? ` ${batch.progress}%` : ''}
      </span>
    );
  }
  return <StatusBadge status={batch.status} kind="import" />;
}

/** Excel import (CLAUDE.md §7): template download, upload, and batch history. */
export function ImportPage() {
  const navigate = useNavigate();
  const [params, setParams] = useListParams({});
  const batches = useImportBatches(params);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const upload = useImportMutation((f: File) => importsApi.upload(f, setUploadProgress));
  const [downloading, setDownloading] = useState(false);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      downloadBlob(await importsApi.template(), 'template-import-sipita.xlsx');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const columns = useMemo<ColumnDef<ImportBatchDto>[]>(
    () => [
      {
        id: 'fileName',
        header: 'File',
        cell: ({ row: { original: b } }) => (
          <Link to={`/import/${b.id}`} className="link link-hover font-medium">
            {b.fileName}
          </Link>
        ),
      },
      {
        id: 'uploadedAt',
        header: 'Diunggah',
        cell: ({ row: { original: b } }) => (
          <div className="whitespace-nowrap">
            <div>{formatDateTime(b.uploadedAt)}</div>
            <div className="text-base-content/60 text-xs">{b.uploadedBy.name}</div>
          </div>
        ),
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <BatchStatus batch={row.original} /> },
      {
        id: 'rows',
        header: 'Baris',
        cell: ({ row: { original: b } }) => (
          <div className="flex flex-wrap gap-1 text-xs whitespace-nowrap">
            <span>{b.totalRows} total</span>
            {b.warningRows > 0 && (
              <span className="text-warning">· {b.warningRows} peringatan</span>
            )}
            {b.errorRows > 0 && <span className="text-error">· {b.errorRows} error</span>}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Excel"
        description="Masukkan data pengadaan historis maupun massal memakai template resmi."
        actions={
          <button
            type="button"
            className="btn btn-soft btn-primary btn-sm"
            onClick={() => void downloadTemplate()}
            disabled={downloading}
          >
            {downloading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Download className="size-4" />
            )}
            Unduh Template
          </button>
        }
      />
      <Can feature="IMPORT" action="create">
        <SectionCard
          title="Upload File"
          description="File divalidasi dulu (pratinjau). Data baru tersimpan setelah Anda menekan Simpan."
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <FileUpload
                kind="xlsx"
                file={file}
                onChange={setFile}
                progress={upload.isPending ? uploadProgress : null}
                disabled={upload.isPending}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!file || upload.isPending}
              onClick={() =>
                file &&
                upload.mutate(file, {
                  onSuccess: (batch) => navigate(`/import/${batch.id}`),
                  onError: (err) => toast.error(getErrorMessage(err)),
                  onSettled: () => setUploadProgress(null),
                })
              }
            >
              <Upload className="size-4" /> Upload & Validasi
            </button>
          </div>
        </SectionCard>
      </Can>
      <DataTable
        columns={columns}
        data={batches.data?.data}
        total={batches.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={batches.isPending}
        isFetching={batches.isFetching}
        error={batches.error}
        searchPlaceholder="Cari nama file..."
        emptyTitle="Belum ada import"
        getRowId={(b) => b.id}
      />
    </div>
  );
}
