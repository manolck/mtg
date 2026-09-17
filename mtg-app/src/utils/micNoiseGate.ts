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

export class MicNoiseGate {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sourceTrack: MediaStreamTrack | null = null;
  private outputTrack: MediaStreamTrack | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private amount = 0;
  private open = true;
  private raf = 0;

  async attach(track: MediaStreamTrack, amount: number): Promise<MediaStreamTrack> {
    this.amount = clamp01(amount);
    if (this.sourceTrack === track && this.outputTrack?.readyState === 'live' && this.ctx) {
      await this.ctx.resume();
      return this.ctx.state === 'running' ? this.outputTrack : track;
    }

    this.teardownGraph();
    this.sourceTrack = track;

    const AudioCtx = audioContextConstructor();
    if (!AudioCtx) return track;

    this.ctx = new AudioCtx();
    this.source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.dest = this.ctx.createMediaStreamDestination();
    this.source.connect(this.analyser);
    this.source.connect(this.gain);
    this.gain.connect(this.dest);
    this.samples = new Uint8Array(this.analyser.fftSize);
    this.outputTrack = this.dest.stream.getAudioTracks()[0] ?? null;
    this.open = true;
    this.loop();

    await this.ctx.resume();
    if (this.ctx.state !== 'running' || !this.outputTrack) return track;
    return this.outputTrack;
  }

  setAmount(amount: number): void {
    this.amount = clamp01(amount);
    if (this.amount <= 0.01 && this.gain && this.ctx) {
      this.open = true;
      this.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
  }

  async ensureOutgoing(): Promise<MediaStreamTrack | null> {
    if (!this.sourceTrack) return this.outputTrack;
    if (this.ctx) await this.ctx.resume();
    if (this.ctx?.state === 'running' && this.outputTrack?.readyState === 'live') {
      return this.outputTrack;
    }
    return this.sourceTrack;
  }

  destroy(): void {
    this.teardownGraph();
    this.sourceTrack = null;
  }

  private loop(): void {
    const tick = () => {
      if (!this.analyser || !this.gain || !this.ctx || !this.samples) return;
      this.analyser.getByteTimeDomainData(this.samples);
      const rms = rmsFromTimeDomain(this.samples);
      const threshold = this.amount * 0.085;
      let target = 1;
      if (this.amount > 0.01) {
        if (rms >= threshold) this.open = true;
        else if (rms <= threshold * 0.55) this.open = false;
        target = this.open ? 1 : (1 - this.amount) * (1 - this.amount);
      }
      this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, target >= 0.99 ? 0.012 : 0.07);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private teardownGraph(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.source?.disconnect();
    this.gain?.disconnect();
    this.analyser?.disconnect();
    this.outputTrack?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.source = null;
    this.gain = null;
    this.analyser = null;
    this.dest = null;
    this.outputTrack = null;
    this.samples = null;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
