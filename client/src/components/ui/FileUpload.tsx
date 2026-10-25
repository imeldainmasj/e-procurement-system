import { FileUp, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ALLOWED_UPLOAD_EXTENSIONS, formatFileSize } from '@sipita/shared';
import { cn } from '@/utils/cn';
import {
  MAX_IMPORT_MB,
  MAX_UPLOAD_MB,
  validateImportFile,
  validateUpload,
} from '@/utils/validateUpload';

interface FileUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string | null;
  disabled?: boolean;
  /** 0–100 while uploading. */
  progress?: number | null;
  /** `xlsx`: Excel import file instead of a document attachment. */
  kind?: 'attachment' | 'xlsx';
}

/** Drag-and-drop single file picker with type/size validation. */
export function FileUpload({
  file,
  onChange,
  error,
  disabled,
  progress,
  kind = 'attachment',
}: FileUploadProps) {
  const xlsx = kind === 'xlsx';
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const problem = xlsx ? validateImportFile(picked) : validateUpload(picked);
    setLocalError(problem);
    onChange(problem ? null : picked);
  };
  const shownError = localError ?? error;

  return (
    <div>
      {file ? (
        <div className="border-base-300 rounded-box flex items-center gap-3 border p-3">
          <FileUp className="text-primary size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-base-content/60 text-xs">{formatFileSize(file.size)}</div>
            {progress != null && (
              <progress
                className="progress progress-primary mt-1 w-full"
                value={progress}
                max={100}
              />
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Hapus file"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            'border-base-300 rounded-box flex cursor-pointer flex-col items-center gap-1 border-2 border-dashed p-6 text-center',
            dragging && 'border-primary bg-primary/5',
            shownError && 'border-error',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <FileUp className="text-base-content/40 size-8" />
          <span className="text-sm">
            <span className="text-primary font-medium">Pilih file</span> atau seret ke sini
          </span>
          <span className="text-base-content/60 text-xs">
            {xlsx ? 'XLSX' : ALLOWED_UPLOAD_EXTENSIONS.join(', ').toUpperCase().replaceAll('.', '')}{' '}
            · maks. {xlsx ? MAX_IMPORT_MB : MAX_UPLOAD_MB} MB
          </span>
        </label>
      )}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        className="hidden"
        accept={xlsx ? '.xlsx' : ALLOWED_UPLOAD_EXTENSIONS.join(',')}
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {shownError && <p className="text-error mt-1 text-sm">{shownError}</p>}
    </div>
  );
}
