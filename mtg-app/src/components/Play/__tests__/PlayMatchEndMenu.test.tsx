import { fireEvent, render, screen } from '@testing-library/react';
import { PlayMatchEndMenu } from '../PlayMatchEndMenu';

describe('PlayMatchEndMenu', () => {
  it('offers a rematch to the winner', () => {
    const onRematch = jest.fn();
    render(
      <PlayMatchEndMenu winnerName="A" isWinner onRematch={onRematch} onLeave={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: 'Victoire' })).toBeInTheDocument();
    expect(screen.getByText('Vous avez gagné la partie.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer' }));
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it('names the winner for the other players', () => {
    render(
      <PlayMatchEndMenu winnerName="A" isWinner={false} onRematch={() => {}} onLeave={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: 'Défaite' })).toBeInTheDocument();
    expect(screen.getByText('A a gagné la partie.')).toBeInTheDocument();
  });
});
