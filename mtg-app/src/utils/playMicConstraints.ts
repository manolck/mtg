export function playMicConstraintAttempts(
  micId?: string,
  options?: { strictDevice?: boolean },
): MediaStreamConstraints[] {
  const voice = (deviceId?: ConstrainDOMString): MediaTrackConstraints => {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) constraints.deviceId = deviceId;
    return constraints;
  };

  const attempts: MediaStreamConstraints[] = [];
  if (micId) {
    attempts.push({ audio: { deviceId: { exact: micId } }, video: false });
    attempts.push({ audio: voice({ exact: micId }), video: false });
    if (!options?.strictDevice) {
      attempts.push({ audio: voice({ ideal: micId }), video: false });
    }
  }
  if (!micId || !options?.strictDevice) {
    attempts.push({ audio: voice(), video: false });
    attempts.push({ audio: true, video: false });
  }
  return attempts;
}
