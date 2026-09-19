import { render, screen } from '@testing-library/react';
import { LifeVial } from '../LifeVial';

describe('LifeVial', () => {
  it('fills the life bar from remaining hit points', () => {
    render(<LifeVial life={20} maxLife={40} />);
    const meter = screen.getByRole('meter', { name: 'Barre de vie' });
    expect(meter).toHaveAttribute('aria-valuenow', '20');
    expect(meter).toHaveAttribute('aria-valuemax', '40');
    expect(screen.getByText(/\/ 40/)).toBeInTheDocument();
  });

  it('shows life controls only for the owner', () => {
    const { rerender } = render(<LifeVial life={40} maxLife={40} />);
    expect(screen.queryByTitle('−1 PV')).not.toBeInTheDocument();
    rerender(<LifeVial life={40} maxLife={40} isSelf onLife={() => {}} onPoison={() => {}} />);
    expect(screen.getByTitle('−1 PV')).toBeInTheDocument();
    rerender(<LifeVial life={40} maxLife={40} isSelf controls="none" onLife={() => {}} onPoison={() => {}} />);
    expect(screen.queryByTitle('−1 PV')).not.toBeInTheDocument();
  });
});
