import { fireEvent, render, screen } from '@testing-library/react';
import { PlayTableChat } from '../PlayTableChat';
import type { PlayAction } from '../../../types/play';

describe('PlayTableChat', () => {
  it('stays inactive until hover, then sends text and dice commands', () => {
    const sent: PlayAction[] = [];
    let n = 0;
    render(
      <PlayTableChat
        messages={[]}
        selfId="u1"
        selfName="A"
        players={[{ userId: 'u1', seatIndex: 0, displayName: 'A' }]}
        newId={() => `id-${(n += 1)}`}
        onSend={(action) => sent.push(action)}
      />,
    );

    const root = screen.getByTestId('play-table-chat');
    expect(root).toHaveAttribute('data-active', 'false');

    const input = screen.getByRole('textbox', { name: 'Chat de table' });
    fireEvent.mouseEnter(input.closest('form') as HTMLFormElement);
    expect(root).toHaveAttribute('data-active', 'true');
    fireEvent.change(input, { target: { value: 'salut' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(sent[0]).toMatchObject({ type: 'chat', text: 'salut', userId: 'u1' });

    fireEvent.change(input, { target: { value: '/r 1d6' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(sent[1]).toMatchObject({
      type: 'chat',
      text: '/r 1d6',
      dice: { count: 1, faces: 6 },
    });
    expect(sent[1].type === 'chat' && sent[1].dice?.rolls).toHaveLength(1);
  });

  it('shows a usage hint for a bad /r command', () => {
    render(
      <PlayTableChat
        messages={[]}
        selfId="u1"
        players={[]}
        onSend={() => {}}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Chat de table' });
    fireEvent.mouseEnter(input.closest('form') as HTMLFormElement);
    fireEvent.change(input, { target: { value: '/r nope' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByText('Usage : /r 1d20')).toBeInTheDocument();
  });
});
