import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-base-content/70">Halaman yang Anda cari tidak ditemukan.</p>
      <Link to="/" className="btn btn-primary">
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
