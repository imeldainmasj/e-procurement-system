import { formatRupiah } from '@sipita/shared';
import { Prisma } from '../../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

/** The range part of an ApprovalRule. A null maxAmount means "no upper bound". */
export interface RuleRange {
  minAmount: Decimal;
  minInclusive: boolean;
  maxAmount: Decimal | null;
  maxInclusive: boolean;
}

interface Point {
  value: Decimal;
  inclusive: boolean;
}

/** True when some amount satisfies both `≥/> lower` and `≤/< upper`. */
function lowerReachesUpper(lower: Point, upper: Point | null): boolean {
  if (upper === null) return true;
  const cmp = lower.value.comparedTo(upper.value);
  return cmp < 0 || (cmp === 0 && lower.inclusive && upper.inclusive);
}

const lowerOf = (r: RuleRange): Point => ({ value: r.minAmount, inclusive: r.minInclusive });
const upperOf = (r: RuleRange): Point | null =>
  r.maxAmount === null ? null : { value: r.maxAmount, inclusive: r.maxInclusive };

export function ruleMatches(rule: RuleRange, amount: Decimal): boolean {
  const point: Point = { value: amount, inclusive: true };
  return lowerReachesUpper(lowerOf(rule), point) && lowerReachesUpper(point, upperOf(rule));
}

export function rangesOverlap(a: RuleRange, b: RuleRange): boolean {
  return lowerReachesUpper(lowerOf(a), upperOf(b)) && lowerReachesUpper(lowerOf(b), upperOf(a));
}

export function describeRange(r: RuleRange): string {
  const lower = `${r.minInclusive ? '≥' : '>'} ${formatRupiah(r.minAmount.toString())}`;
  if (r.maxAmount === null) return lower;
  return `${lower} dan ${r.maxInclusive ? '≤' : '<'} ${formatRupiah(r.maxAmount.toString())}`;
}

/**
 * Returns the uncovered ranges between 0 and infinity, given non-overlapping rules.
 * Each gap is expressed as a RuleRange so it can be described the same way.
 */
export function findCoverageGaps(rules: RuleRange[]): RuleRange[] {
  // Order by lower bound; an inclusive bound starts before an exclusive one at the same value.
  const sorted = [...rules].sort(
    (a, b) =>
      a.minAmount.comparedTo(b.minAmount) || Number(b.minInclusive) - Number(a.minInclusive),
  );

  const gaps: RuleRange[] = [];
  // First amount not yet known to be covered; null once coverage reaches infinity.
  let cursor: Point | null = { value: new Prisma.Decimal(0), inclusive: true };

  for (const rule of sorted) {
    if (cursor === null) break;
    const startsAfterCursor =
      rule.minAmount.comparedTo(cursor.value) > 0 ||
      (rule.minAmount.equals(cursor.value) && cursor.inclusive && !rule.minInclusive);
    if (startsAfterCursor) {
      gaps.push({
        minAmount: cursor.value,
        minInclusive: cursor.inclusive,
        maxAmount: rule.minAmount,
        maxInclusive: !rule.minInclusive,
      });
    }

    if (rule.maxAmount === null) {
      cursor = null;
    } else {
      const next: Point = { value: rule.maxAmount, inclusive: !rule.maxInclusive };
      const nextIsLater =
        next.value.comparedTo(cursor.value) > 0 ||
        (next.value.equals(cursor.value) && !next.inclusive && cursor.inclusive);
      if (nextIsLater) cursor = next;
    }
  }

  if (cursor !== null) {
    gaps.push({
      minAmount: cursor.value,
      minInclusive: cursor.inclusive,
      maxAmount: null,
      maxInclusive: false,
    });
  }
  return gaps;
}
