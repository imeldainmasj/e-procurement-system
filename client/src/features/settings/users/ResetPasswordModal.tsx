import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { type ResetPasswordInput, resetPasswordSchema, type UserDto } from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useResetPassword } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';

export function ResetPasswordModal({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit((input) =>
    reset.mutate(
      { id: user.id, input },
      {
        onSuccess: () => {
          toast.success(`Password ${user.name} berhasil direset`);
          onClose();
        },
      },
    ),
  );

  return (
    <Modal open onClose={onClose} title="Reset Password" size="sm">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={reset.error} />
        <p className="text-base-content/80 mb-2 text-sm">
          Atur password baru untuk <b>{user.name}</b>. Semua sesi login pengguna ini akan diakhiri.
        </p>
        <FormField
          label="Password Baru"
          required
          error={errors.password?.message}
          hint="Min. 8 karakter, mengandung huruf dan angka"
        >
          <input
            type="password"
            autoComplete="new-password"
            className="input w-full"
            {...register('password')}
            autoFocus
          />
        </FormField>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-warning" disabled={reset.isPending}>
            {reset.isPending && <span className="loading loading-spinner loading-sm" />}
            Reset Password
          </button>
        </div>
      </form>
    </Modal>
  );
}
