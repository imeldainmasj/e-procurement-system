import { describe, expect, it } from 'vitest';
import { hasAnyRole } from './rbac.js';

describe('hasAnyRole', () => {
  it('allows any authenticated user when no role is required', () => {
    expect(hasAnyRole(['REQUESTER'], [])).toBe(true);
  });

  it('matches when the user has one of the roles', () => {
    expect(hasAnyRole(['REQUESTER', 'WAREHOUSE'], ['WAREHOUSE'])).toBe(true);
    expect(hasAnyRole(['REQUESTER'], ['PROCUREMENT', 'VIEWER'])).toBe(false);
  });

  it('lets SUPER_ADMIN through every check', () => {
    expect(hasAnyRole(['SUPER_ADMIN'], ['APPROVER'])).toBe(true);
  });

  it('denies a user without roles', () => {
    expect(hasAnyRole([], ['VIEWER'])).toBe(false);
  });
});
