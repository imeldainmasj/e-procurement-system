import { MEMO_TYPES, type MemoType, type MilestoneType, type ProcurementMethod } from './enums.js';

const TENDER_LIKE: readonly ProcurementMethod[] = ['TENDER', 'BIDDING'];

/** The milestone a memo type completes for a method; null when the type does not fit. */
export function memoMilestone(memoType: MemoType, method: ProcurementMethod): MilestoneType | null {
  switch (memoType) {
    case 'MEMO_PROCUREMENT':
      return TENDER_LIKE.includes(method) ? 'MEMO' : null;
    case 'MEMO_PL':
      return method === 'DIRECT_APPOINTMENT' ? 'MEMO' : null;
    case 'MEMO_PK':
      return method === 'SPECIAL_EXTENSION' ? 'MEMO' : null;
    case 'MOA_TENDER_RESULT':
      return TENDER_LIKE.includes(method) ? 'MOA_METHOD' : null;
    case 'MOA_PL':
      return method === 'DIRECT_APPOINTMENT' ? 'MOA_METHOD' : null;
    case 'MOA_PK':
      return method === 'SPECIAL_EXTENSION' ? 'MOA_METHOD' : null;
    case 'MOA_COST':
      return 'MOA_COST';
  }
}

export function memoTypesFor(method: ProcurementMethod): MemoType[] {
  return MEMO_TYPES.filter((t) => memoMilestone(t, method) !== null);
}
