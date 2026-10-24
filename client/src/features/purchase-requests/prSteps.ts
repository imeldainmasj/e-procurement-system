import type { PrStatus } from '@sipita/shared';

export type StepState = 'done' | 'current' | 'error' | 'todo';

export interface PrStep {
  label: string;
  state: StepState;
}

/** Main path; each step lists the statuses that mean "we are at this step". */
const MAIN_FLOW: { label: string; statuses: PrStatus[] }[] = [
  { label: 'Draft', statuses: ['DRAFT'] },
  { label: 'Diajukan', statuses: ['SUBMITTED'] },
  { label: 'Cek Stok', statuses: ['STOCK_CHECK'] },
  { label: 'Approval', statuses: ['PENDING_APPROVAL', 'REJECTED'] },
  { label: 'Penawaran', statuses: ['APPROVED', 'QUOTATION'] },
  { label: 'PO', statuses: ['PO_ISSUED'] },
  { label: 'Penerimaan', statuses: ['PARTIALLY_RECEIVED', 'RECEIVED'] },
  { label: 'Selesai', statuses: ['COMPLETED'] },
];

const stepIndexOf = (status: PrStatus) => MAIN_FLOW.findIndex((s) => s.statuses.includes(status));

/**
 * Steps for the progress bar. FULFILLED_FROM_STOCK ends right after the stock check;
 * REJECTED marks the approval step as failed; CANCELLED marks the step it was cancelled at
 * (`cancelledFrom`, taken from the history) as failed.
 */
export function buildPrSteps(status: PrStatus, cancelledFrom?: PrStatus | null): PrStep[] {
  if (status === 'FULFILLED_FROM_STOCK') {
    return [
      ...MAIN_FLOW.slice(0, 3).map((s) => ({ label: s.label, state: 'done' as const })),
      { label: 'Dipenuhi dari Stok', state: 'done' },
    ];
  }

  const effective = status === 'CANCELLED' ? (cancelledFrom ?? 'DRAFT') : status;
  const index = stepIndexOf(effective);
  const failed = status === 'CANCELLED' || status === 'REJECTED';
  const finished = status === 'COMPLETED';

  return MAIN_FLOW.map((step, i) => {
    let state: StepState = 'todo';
    if (i < index || (i === index && finished)) state = 'done';
    else if (i === index) state = failed ? 'error' : 'current';
    // The approval decision itself is done once approved.
    if (step.label === 'Approval' && status === 'APPROVED') state = 'done';
    return { label: step.label, state };
  });
}
