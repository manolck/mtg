import { rtcOutgoingAudioTrack, setRtpSenderSending } from '../rtcOutgoingAudio';

function fakeTrack(
  overrides: Partial<Pick<MediaStreamTrack, 'enabled' | 'readyState' | 'kind'>> = {},
): MediaStreamTrack {
  return {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    ...overrides,
  } as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]): MediaStream {
  return { getAudioTracks: () => tracks } as MediaStream;
}

describe('rtcOutgoingAudioTrack', () => {
  it('returns null when muted so senders can drop the track', () => {
    expect(rtcOutgoingAudioTrack(fakeStream([fakeTrack()]), false)).toBeNull();
  });

  it('returns null without a stream or a live enabled track', () => {
    expect(rtcOutgoingAudioTrack(null, true)).toBeNull();
    expect(rtcOutgoingAudioTrack(fakeStream([]), true)).toBeNull();
    expect(rtcOutgoingAudioTrack(fakeStream([fakeTrack({ enabled: false })]), true)).toBeNull();
    expect(rtcOutgoingAudioTrack(fakeStream([fakeTrack({ readyState: 'ended' })]), true)).toBeNull();
  });

  it('returns the live track when sending is enabled', () => {
    const track = fakeTrack();
    expect(rtcOutgoingAudioTrack(fakeStream([track]), true)).toBe(track);
  });
});

describe('setRtpSenderSending', () => {
  it('sets encoding.active when encodings already exist', async () => {
    const encoding = { active: true };
    const sender = {
      getParameters: () => ({ encodings: [encoding] }),
      setParameters: jest.fn(async (params: RTCRtpSendParameters) => {
        encoding.active = Boolean(params.encodings[0].active);
      }),
    } as unknown as RTCRtpSender;

    await setRtpSenderSending(sender, false);
    expect(sender.setParameters).toHaveBeenCalledTimes(1);
    expect(encoding.active).toBe(false);
  });

  it('does nothing when encodings are not ready yet', async () => {
    const sender = {
      getParameters: () => ({ encodings: [] }),
      setParameters: jest.fn(),
    } as unknown as RTCRtpSender;

    await setRtpSenderSending(sender, false);
    expect(sender.setParameters).not.toHaveBeenCalled();
  });
});
