/** Unlock autoplay-blocked remote <audio> elements after a user gesture. */
export function unlockRemoteAudio(): void {
  document.querySelectorAll('audio').forEach((el) => {
    el.muted = false;
    el.volume = 1;
    void el.play().catch(() => {});
  });
}
