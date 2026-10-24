import type { MilestoneType } from '@sipita/shared';

export type DocumentTab = 'memo' | 'rfq' | 'pvp' | 'po' | 'agreement';

/** Which tab records the document of a milestone (used by the milestone editor). */
export const TAB_FOR_MILESTONE: Partial<Record<MilestoneType, DocumentTab>> = {
  MEMO: 'memo',
  MOA_METHOD: 'memo',
  MOA_COST: 'memo',
  RFQ: 'rfq',
  LOA: 'rfq',
  PVP: 'pvp',
  PO: 'po',
  AGREEMENT: 'agreement',
  AGREEMENT_OR_ADDENDUM: 'agreement',
};
