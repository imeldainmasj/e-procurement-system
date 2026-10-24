import { canTransition } from '@sipita/shared';
import { AppError } from './AppError.js';

/**
 * Throws 409 INVALID_STATUS_TRANSITION unless `from → to` is allowed.
 * `labels` turns status codes into Indonesian names for the error message.
 */
export function assertTransition<S extends string>(
  transitions: Record<S, readonly S[]>,
  from: S,
  to: S,
  labels: Record<S, string>,
): void {
  if (!canTransition(transitions, from, to)) {
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Status tidak dapat diubah dari "${labels[from]}" ke "${labels[to]}"`,
    );
  }
}
