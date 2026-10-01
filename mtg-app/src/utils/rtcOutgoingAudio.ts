/** Track to attach to RTP senders, or null so mute does not send audio packets. */
export function rtcOutgoingAudioTrack(
  stream: MediaStream | null | undefined,
  sendEnabled: boolean,
): MediaStreamTrack | null {
  if (!sendEnabled || !stream) return null;
  const track = stream.getAudioTracks().find((item) => item.readyState !== 'ended') ?? null;
  if (!track?.enabled) return null;
  return track;
}

/** Pause or resume RTP encodings without a renegotiation when the browser allows it. */
export async function setRtpSenderSending(sender: RTCRtpSender, sending: boolean): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    let changed = false;
    for (const encoding of params.encodings) {
      if (encoding.active !== sending) {
        encoding.active = sending;
        changed = true;
      }
    }
    if (changed) await sender.setParameters(params);
  } catch {
    /* Safari and pre-negotiation senders may reject setParameters */
  }
}
