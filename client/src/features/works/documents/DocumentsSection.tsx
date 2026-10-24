import type { MilestoneType, WorkDetailDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { SectionCard } from '@/components/ui/SectionCard';
import { useWorkDocuments } from '@/hooks/useDocuments';
import { cn } from '@/utils/cn';
import { AgreementTab } from './AgreementTab';
import type { DocumentTab } from './documentTabs';
import { MemoTab } from './MemoTab';
import { PoTab } from './PoTab';
import { PvpTab } from './PvpTab';
import { RfqTab } from './RfqTab';

/**
 * Document tabs of the work detail page (CLAUDE.md §10). Recording a document completes its
 * milestone; the server rejects documents whose prerequisites are still open.
 */
export function DocumentsSection({
  work,
  tab,
  onTabChange,
}: {
  work: WorkDetailDto;
  tab: DocumentTab;
  onTabChange: (tab: DocumentTab) => void;
}) {
  const docs = useWorkDocuments(work.id);
  const has = (type: MilestoneType) => work.milestones.some((m) => m.type === type);
  const d = docs.data;

  const tabs: { key: DocumentTab; label: string; count?: number; show: boolean }[] = [
    { key: 'memo', label: 'Memo & MoA', count: d?.memos.length, show: true },
    { key: 'rfq', label: 'RFQ & LoA', count: d?.rfq ? 1 : 0, show: has('RFQ') },
    { key: 'pvp', label: 'PVP', count: d?.pvp ? 1 : 0, show: has('PVP') },
    { key: 'po', label: 'PO & TOP', count: d?.purchaseOrders.length, show: has('PO') },
    {
      key: 'agreement',
      label: work.method === 'SPECIAL_EXTENSION' ? 'Agreement / Addendum' : 'Agreement',
      count: (d?.agreements.length ?? 0) + (d?.addendums.length ?? 0),
      show: true,
    },
  ];
  const active = tabs.find((t) => t.key === tab && t.show) ? tab : 'memo';

  return (
    <SectionCard title="Dokumen" flush>
      <div role="tablist" className="tabs tabs-border px-2">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              className={cn('tab', active === t.key && 'tab-active')}
              onClick={() => onTabChange(t.key)}
            >
              {t.label}
              {t.count ? (
                <span className="badge badge-xs badge-soft badge-primary ms-1">{t.count}</span>
              ) : null}
            </button>
          ))}
      </div>
      {docs.isPending ? (
        <div className="skeleton m-4 h-32" />
      ) : docs.isError ? (
        <div role="alert" className="alert alert-error m-4">
          <span>{getErrorMessage(docs.error)}</span>
        </div>
      ) : (
        <>
          {active === 'memo' && <MemoTab work={work} memos={docs.data.memos} />}
          {active === 'rfq' && <RfqTab work={work} rfq={docs.data.rfq} />}
          {active === 'pvp' && <PvpTab work={work} pvp={docs.data.pvp} />}
          {active === 'po' && <PoTab work={work} purchaseOrders={docs.data.purchaseOrders} />}
          {active === 'agreement' && <AgreementTab work={work} docs={docs.data} />}
        </>
      )}
    </SectionCard>
  );
}
