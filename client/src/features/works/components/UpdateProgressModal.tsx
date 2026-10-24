import { useState } from 'react';
import type { WorkMilestoneDto } from '@sipita/shared';
import { FileUpload } from '@/components/ui/FileUpload';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useWork, useWorkMutations } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';

interface Props {
  workId: string;
  workTitle: string;
  /** Milestones for the picker; loaded from the work when not given (list pages). */
  milestones: WorkMilestoneDto[] | null;
  onClose: () => void;
}

/** Append-only progress note (replaces the per-row updates in the old Excel). */
export function UpdateProgressModal({ workId, workTitle, milestones, onClose }: Props) {
  const detail = useWork(milestones ? undefined : workId);
  const options = (milestones ?? detail.data?.milestones ?? []).filter(
    (m) => m.status !== 'NOT_APPLICABLE',
  );
  const { addUpdate } = useWorkMutations();
  const [note, setNote] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('Catatan progres wajib diisi');
      return;
    }
    addUpdate.mutate(
      { id: workId, note: note.trim(), milestoneId: milestoneId || null, file },
      {
        onSuccess: () => {
          toast.success('Progres dicatat');
          onClose();
        },
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Update Progres">
      <form onSubmit={submit} noValidate>
        <p className="text-base-content/70 mb-2 text-sm">{workTitle}</p>
        <FormError error={addUpdate.error} />
        <FormField label="Catatan" required error={error ?? undefined}>
          <textarea
            className="textarea w-full"
            rows={4}
            placeholder="Mis. draft MoA Biaya sudah dikirim ke Keuangan, menunggu paraf."
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError(null);
            }}
            autoFocus
          />
        </FormField>
        <FormField label="Terkait milestone" hint="Opsional">
          <select
            className="select w-full"
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
          >
            <option value="">— Umum —</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Lampiran" hint="Opsional: bukti progres (PDF, gambar, Excel, Word)">
          <FileUpload file={file} onChange={setFile} disabled={addUpdate.isPending} />
        </FormField>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={addUpdate.isPending}>
            {addUpdate.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan Progres
          </button>
        </div>
      </form>
    </Modal>
  );
}
