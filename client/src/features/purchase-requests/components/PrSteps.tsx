import type { PrStatus } from '@sipita/shared';
import { cn } from '@/utils/cn';
import { buildPrSteps } from '../prSteps';

const stateClass = {
  done: 'step-primary',
  current: 'step-primary',
  error: 'step-error',
  todo: '',
} as const;

export function PrSteps({
  status,
  cancelledFrom,
}: {
  status: PrStatus;
  cancelledFrom?: PrStatus | null;
}) {
  const steps = buildPrSteps(status, cancelledFrom);
  return (
    <div className="overflow-x-auto">
      <ul className="steps steps-horizontal w-full min-w-[640px]">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              'step text-xs',
              stateClass[step.state],
              step.state === 'current' && 'font-semibold',
            )}
            data-content={step.state === 'done' ? '✓' : step.state === 'error' ? '✕' : undefined}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            {step.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
