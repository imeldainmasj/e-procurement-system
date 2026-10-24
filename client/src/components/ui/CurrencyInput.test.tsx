import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CurrencyInput } from './CurrencyInput';

function Harness() {
  const [value, setValue] = useState<number | null>(1250000);
  return (
    <>
      <CurrencyInput aria-label="nominal" value={value} onChange={setValue} />
      <output>{String(value)}</output>
    </>
  );
}

describe('<CurrencyInput>', () => {
  it('formats with thousand separators and exposes a number', () => {
    render(<Harness />);
    const input = screen.getByLabelText('nominal');
    expect(input).toHaveValue('1.250.000');

    fireEvent.change(input, { target: { value: 'Rp 10.000.000x' } });
    expect(input).toHaveValue('10.000.000');
    expect(screen.getByRole('status')).toHaveTextContent('10000000');

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('status')).toHaveTextContent('null');
  });
});
