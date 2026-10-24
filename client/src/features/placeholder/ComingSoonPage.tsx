import { Construction } from 'lucide-react';

/** Temporary page for routes whose module is built in a later stage. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body items-center py-16 text-center">
          <Construction className="text-base-content/40 size-12" />
          <p className="text-base-content/70">Modul ini sedang dalam pengembangan.</p>
        </div>
      </div>
    </div>
  );
}
