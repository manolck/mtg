import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RtcControls } from '../RtcControls';

describe('RtcControls', () => {
  it('shows live packet stats on mic hover and has no camera control', async () => {
    const getAudioStats = jest.fn().mockResolvedValue({
      packetsSent: 12,
      packetsReceived: 34,
      packetsLost: 1,
    });

    render(
      <RtcControls
        micOn
        mics={
          [
            { deviceId: 'mic-2', label: 'USB Mic', kind: 'audioinput', groupId: 'g' },
          ] as MediaDeviceInfo[]
        }
        micId="mic-2"
        onToggleMic={() => {}}
        onMicChange={() => {}}
        getAudioStats={getAudioStats}
      />,
    );

    expect(screen.queryByRole('button', { name: /caméra/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/réduction de bruit/i)).not.toBeInTheDocument();

    const micButton = screen.getByRole('button', { name: /Couper le micro/i });
    fireEvent.mouseEnter(micButton.parentElement as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Paquets envoyés : 12')).toBeInTheDocument();
      expect(screen.getByText('Paquets reçus : 34')).toBeInTheDocument();
      expect(screen.getByText('Paquets perdus : 1')).toBeInTheDocument();
    });
  });
});
