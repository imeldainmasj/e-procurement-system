import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { type Location, useLocation, useNavigate } from 'react-router-dom';
import { type LoginInput, loginSchema } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';

const DEMO_ACCOUNTS = [
  ['superadmin', 'Super Admin'],
  ['requester', 'Requester'],
  ['gudang', 'Admin Gudang IT'],
  ['pengadaan', 'Staf Pengadaan'],
  ['manajer.it', 'Approver L1 — Manajer IT'],
  ['keuangan', 'Approver L2 — Keuangan'],
  ['direksi', 'Approver L3 — Direksi'],
  ['manajemen', 'Manajemen (Viewer)'],
] as const;

export function LoginPage() {
  const { loginMutation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values, {
      onSuccess: () => {
        const from = (location.state as { from?: Location } | null)?.from;
        navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true });
      },
    });
  });

  const fillDemo = (username: string) => {
    setValue('email', `${username}@perusahaan.co.id`, { shouldValidate: true });
    setValue('password', 'Password123!', { shouldValidate: true });
  };

  return (
    <div className="bg-base-200 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-primary text-3xl font-bold">{import.meta.env.VITE_APP_NAME}</h1>
          <p className="text-base-content/70">Sistem Informasi Pengadaan IT & Aset</p>
        </div>

        <div className="card bg-base-100 shadow-md">
          <form className="card-body gap-4" onSubmit={onSubmit} noValidate>
            <h2 className="card-title">Masuk</h2>

            {loginMutation.isError && (
              <div role="alert" className="alert alert-error alert-soft">
                <span>{getErrorMessage(loginMutation.error)}</span>
              </div>
            )}

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Email</legend>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                className={`input w-full ${errors.email ? 'input-error' : ''}`}
                placeholder="nama@perusahaan.co.id"
                {...register('email')}
              />
              {errors.email && <p className="text-error">{errors.email.message}</p>}
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Password</legend>
              <label className={`input w-full ${errors.password ? 'input-error' : ''}`}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="grow"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </label>
              {errors.password && <p className="text-error">{errors.password.message}</p>}
            </fieldset>

            <button type="submit" className="btn btn-primary" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <LogIn className="size-4" />
              )}
              Masuk
            </button>
          </form>
        </div>

        {import.meta.env.DEV && (
          <div className="collapse-arrow bg-base-100 collapse shadow-sm">
            <input type="checkbox" aria-label="Tampilkan akun demo" />
            <div className="collapse-title text-sm font-medium">Akun demo (mode pengembangan)</div>
            <div className="collapse-content">
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map(([username, label]) => (
                  <button
                    key={username}
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={() => fillDemo(username)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
