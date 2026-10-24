import { ChevronRight } from 'lucide-react';
import { levelLabel } from '@/utils/approvalRule';

/** "Manajer IT → Keuangan → Direksi" as badges. */
export function ApprovalPath({ levels }: { levels: number[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {levels.map((level, i) => (
        <span key={level} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="text-base-content/40 size-3" />}
          <span className="badge badge-sm badge-outline whitespace-nowrap">
            {levelLabel(level)}
          </span>
        </span>
      ))}
    </div>
  );
}
