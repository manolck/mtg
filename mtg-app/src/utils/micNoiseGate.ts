function audioContextConstructor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function rmsFromTimeDomain(samples: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function noiseGateThreshold(amount: number): number {
  return clamp01(amount) * 0.085;
}

export function nextNoiseGateOpen(rms: number, amount: number, open: boolean): boolean {
  if (amount <= 0.01) return true;
  const threshold = noiseGateThreshold(amount);
  if (rms >= threshold) return true;
  if (rms <= threshold * 0.55) return false;
  return open;
}

export function shouldSendMic(userEnabled: boolean, amount: number, open: boolean): boolean {
  if (!userEnabled) return false;
  if (amount <= 0.01) return true;
  return open;
}

export class MicNoiseGate {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceTrack: MediaStreamTrack | null = null;
  private analysisTrack: MediaStreamTrack | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private amount = 0;
  private open = true;
  private userEnabled = true;
  private raf = 0;

  async attach(track: MediaStreamTrack, amount: number): Promise<MediaStreamTrack> {
    this.amount = clamp01(amount);
    if (this.sourceTrack === track && this.ctx) {
      await this.ctx.resume();
      this.applySend();
      return track;
    }

    this.teardownGraph();
    this.sourceTrack = track;
    if ('contentHint' in track) track.contentHint = 'speech';

    const AudioCtx = audioContextConstructor();
    if (!AudioCtx) {
      this.applySend();
      return track;
    }

    this.analysisTrack = track.clone();
    this.analysisTrack.enabled = true;
    this.ctx = new AudioCtx();
    this.source = this.ctx.createMediaStreamSource(new MediaStream([this.analysisTrack]));
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;
    this.source.connect(this.analyser);
    this.samples = new Uint8Array(this.analyser.fftSize);
    this.open = true;
    this.loop();
    await this.ctx.resume();
    this.applySend();
    return track;
  }

  setAmount(amount: number): void {
    this.amount = clamp01(amount);
    if (this.amount <= 0.01) this.open = true;
    this.applySend();
  }

  setUserEnabled(enabled: boolean): void {
    this.userEnabled = enabled;
    this.applySend();
  }

  async ensureOutgoing(): Promise<MediaStreamTrack | null> {
    if (this.ctx) await this.ctx.resume();
    this.applySend();
    return this.sourceTrack;
  }

  destroy(): void {
    this.teardownGraph();
    this.sourceTrack = null;
  }

  private applySend(): void {
    if (!this.sourceTrack) return;
    this.sourceTrack.enabled = shouldSendMic(this.userEnabled, this.amount, this.open);
  }

  private loop(): void {
    const tick = () => {
      if (!this.analyser || !this.samples) return;
      this.analyser.getByteTimeDomainData(this.samples);
      const rms = rmsFromTimeDomain(this.samples);
      this.open = nextNoiseGateOpen(rms, this.amount, this.open);
      this.applySend();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private teardownGraph(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.source?.disconnect();
    this.analysisTrack?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.analysisTrack = null;
    this.samples = null;
  }
}
