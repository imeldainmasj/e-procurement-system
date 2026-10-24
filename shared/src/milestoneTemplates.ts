import type { Executor, MilestoneType, ProcurementMethod } from './enums.js';

export interface MilestoneTemplateDef {
  type: MilestoneType;
  /** Milestones sharing a sequence may run in parallel. */
  sequence: number;
  executor: Executor;
  prerequisites: MilestoneType[];
  /** Only applies when PVP is required (PVP* in CLAUDE.md §5.4). */
  isConditional: boolean;
}

/** Sequential: the LoA (processed outside IT) follows the MoA and precedes the cost MoA. */
const tenderOrBidding: MilestoneTemplateDef[] = [
  { type: 'MEMO', sequence: 1, executor: 'IT', prerequisites: [], isConditional: false },
  { type: 'RFQ', sequence: 2, executor: 'IT', prerequisites: ['MEMO'], isConditional: false },
  { type: 'PVP', sequence: 3, executor: 'DIRECTORS', prerequisites: ['RFQ'], isConditional: true },
  { type: 'MOA_METHOD', sequence: 4, executor: 'IT', prerequisites: ['PVP'], isConditional: false },
  {
    type: 'LOA',
    sequence: 5,
    executor: 'OTHER_TEAM',
    prerequisites: ['MOA_METHOD'],
    isConditional: false,
  },
  { type: 'MOA_COST', sequence: 6, executor: 'IT', prerequisites: ['LOA'], isConditional: false },
  {
    type: 'PO',
    sequence: 7,
    executor: 'IT',
    prerequisites: ['MOA_METHOD', 'MOA_COST'],
    isConditional: false,
  },
  { type: 'AGREEMENT', sequence: 8, executor: 'IT', prerequisites: ['PO'], isConditional: false },
];

function withOfficialApproval(finalStep: MilestoneType): MilestoneTemplateDef[] {
  return [
    { type: 'MEMO', sequence: 1, executor: 'IT', prerequisites: [], isConditional: false },
    {
      type: 'PVP',
      sequence: 2,
      executor: 'DIRECTORS',
      prerequisites: ['MEMO'],
      isConditional: true,
    },
    {
      type: 'OFFICIAL_APPROVAL',
      sequence: 3,
      executor: 'OFFICIAL',
      prerequisites: ['PVP'],
      isConditional: false,
    },
    {
      type: 'MOA_METHOD',
      sequence: 4,
      executor: 'IT',
      prerequisites: ['OFFICIAL_APPROVAL'],
      isConditional: false,
    },
    {
      type: 'MOA_COST',
      sequence: 4,
      executor: 'IT',
      prerequisites: ['OFFICIAL_APPROVAL'],
      isConditional: false,
    },
    {
      type: 'PO',
      sequence: 5,
      executor: 'IT',
      prerequisites: ['MOA_METHOD', 'MOA_COST'],
      isConditional: false,
    },
    { type: finalStep, sequence: 6, executor: 'IT', prerequisites: ['PO'], isConditional: false },
  ];
}

/**
 * Initial milestone templates per method (CLAUDE.md §5.4). Used only to seed
 * `milestone_templates`; at runtime the templates are read from the database.
 */
export const DEFAULT_MILESTONE_TEMPLATES: Record<ProcurementMethod, MilestoneTemplateDef[]> = {
  TENDER: tenderOrBidding,
  BIDDING: tenderOrBidding,
  DIRECT_APPOINTMENT: withOfficialApproval('AGREEMENT'),
  SPECIAL_EXTENSION: withOfficialApproval('AGREEMENT_OR_ADDENDUM'),
};
