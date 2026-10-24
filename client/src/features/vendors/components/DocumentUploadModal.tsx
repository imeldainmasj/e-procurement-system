import { useState } from 'react';
import {
  VENDOR_DOCUMENT_TYPE_LABELS,
  VENDOR_DOCUMENT_TYPES,
  type VendorDocumentType,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { FileUpload } from '@/components/ui/FileUpload';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useVendorMutations } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';

export function DocumentUploadModal({
  vendorId,
  onClose,
}: {
  vendorId: string;
  onClose: () => void;
}) {
  const { uploadDocument } = useVendorMutations();
  const [type, setType] = useState<VendorDocumentType>('SIUP');
  const [number, setNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!file) {
      setError('Pilih file dokumen');
      return;
    }
    setError(null);
    setProgress(0);
    uploadDocument.mutate(
      { id: vendorId, input: { type, number, expiresAt, notes }, file, onProgress: setProgress },
      {
        onSuccess: () => {
          toast.success('Dokumen diunggah');
          onClose();
        },
        onError: (err) => {
          setProgress(null);
          setError(getErrorMessage(err));
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Unggah Dokumen Legal"
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={uploadDocument.isPending}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={uploadDocument.isPending}
          >
            {uploadDocument.isPending && <span className="loading loading-spinner loading-sm" />}
            Unggah
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormField label="Jenis Dokumen" required>
          <select
            className="select w-full"
            value={type}
            onChange={(e) => setType(e.target.value as VendorDocumentType)}
          >
            {VENDOR_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {VENDOR_DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nomor Dokumen">
          <input
            className="input w-full"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </FormField>
        <FormField label="Berlaku Sampai" hint="Kosongkan jika tidak ada masa berlaku">
          <input
            type="date"
            className="input w-full"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </FormField>
        <FormField label="Catatan">
          <input
            className="input w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="File" required className="mt-2">
        <FileUpload
          file={file}
          onChange={setFile}
          error={error}
          disabled={uploadDocument.isPending}
          progress={progress}
        />
      </FormField>
    </Modal>
  );
}
