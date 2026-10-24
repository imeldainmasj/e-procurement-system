import { describe, expect, it } from 'vitest';
import type { PrStatus, Role } from '../enums.js';
import { canTransition, PR_TRANSITIONS } from '../status.js';
import {
  canCancelPr,
  canCompleteStockCheck,
  canEditPr,
  canStartStockCheck,
  canViewPr,
} from './pr.rules.js';

const owner = { id: 'owner', roles: ['REQUESTER'] as Role[] };
const warehouse = { id: 'wh', roles: ['WAREHOUSE'] as Role[] };
const procurement = { id: 'proc', roles: ['PROCUREMENT'] as Role[] };
const otherRequester = { id: 'other', roles: ['REQUESTER'] as Role[] };
const pr = (status: PrStatus) => ({ requesterId: 'owner', status });

describe('PR transitions', () => {
  it('follows the main flow', () => {
    expect(canTransition(PR_TRANSITIONS, 'DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition(PR_TRANSITIONS, 'STOCK_CHECK', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransition(PR_TRANSITIONS, 'RECEIVED', 'COMPLETED')).toBe(true);
  });

  it('forbids skipping steps and leaving terminal states', () => {
    expect(canTransition(PR_TRANSITIONS, 'DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition(PR_TRANSITIONS, 'SUBMITTED', 'PENDING_APPROVAL')).toBe(false);
    expect(canTransition(PR_TRANSITIONS, 'CANCELLED', 'SUBMITTED')).toBe(false);
    expect(canTransition(PR_TRANSITIONS, 'PO_ISSUED', 'CANCELLED')).toBe(false);
    expect(canTransition(PR_TRANSITIONS, 'PO_ISSUED', 'QUOTATION')).toBe(true);
  });
});

describe('PR rules', () => {
  it('keeps drafts private to their owner', () => {
    expect(canViewPr(pr('DRAFT'), owner)).toBe(true);
    expect(canViewPr(pr('DRAFT'), warehouse)).toBe(false);
    expect(canViewPr(pr('SUBMITTED'), warehouse)).toBe(true);
    expect(canViewPr(pr('SUBMITTED'), otherRequester)).toBe(false);
  });

  it('lets only the owner edit, and only drafts', () => {
    expect(canEditPr(pr('DRAFT'), owner)).toBe(true);
    expect(canEditPr(pr('SUBMITTED'), owner)).toBe(false);
    expect(canEditPr(pr('DRAFT'), { id: 'admin', roles: ['SUPER_ADMIN'] })).toBe(false);
  });

  it('gives the stock check to the warehouse', () => {
    expect(canStartStockCheck(pr('SUBMITTED'), warehouse)).toBe(true);
    expect(canStartStockCheck(pr('SUBMITTED'), owner)).toBe(false);
    expect(canCompleteStockCheck(pr('STOCK_CHECK'), warehouse)).toBe(true);
    expect(canCompleteStockCheck(pr('SUBMITTED'), warehouse)).toBe(false);
  });

  it('limits cancellation by role and status', () => {
    expect(canCancelPr(pr('PENDING_APPROVAL'), owner)).toBe(true);
    expect(canCancelPr(pr('APPROVED'), owner)).toBe(false);
    expect(canCancelPr(pr('QUOTATION'), procurement)).toBe(true);
    expect(canCancelPr(pr('PO_ISSUED'), procurement)).toBe(false);
    expect(canCancelPr(pr('SUBMITTED'), warehouse)).toBe(false);
  });
});
