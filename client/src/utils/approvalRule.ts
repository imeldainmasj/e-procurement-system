import { APPROVAL_LEVEL_LABELS, type ApprovalRuleDto, formatRupiah } from '@sipita/shared';

export function describeRuleRange(
  rule: Pick<ApprovalRuleDto, 'minAmount' | 'minInclusive' | 'maxAmount' | 'maxInclusive'>,
): string {
  const lower = `${rule.minInclusive ? '≥' : '>'} ${formatRupiah(rule.minAmount)}`;
  if (rule.maxAmount === null) return lower;
  return `${lower} dan ${rule.maxInclusive ? '≤' : '<'} ${formatRupiah(rule.maxAmount)}`;
}

export function levelLabel(level: number): string {
  return APPROVAL_LEVEL_LABELS[level] ?? `Level ${level}`;
}
