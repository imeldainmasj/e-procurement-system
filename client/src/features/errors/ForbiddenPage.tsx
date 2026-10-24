import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <ShieldX className="text-error size-16" />
      <h1 className="text-2xl font-bold">Akses Ditolak</h1>
      <p className="text-base-content/70">
        Anda tidak memiliki hak akses untuk membuka halaman ini.
      </p>
      <Link to="/" className="btn btn-primary">
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
