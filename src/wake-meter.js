class QuinWakeMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    const frameSize = Math.round(sampleRate / 50);
    this.frame = new Float32Array(frameSize);
    this.preRoll = new Float32Array(frameSize * 12);
    this.clip = new Float32Array(frameSize * 600);
    this.enabled = false;
    this.reset();
    this.port.onmessage = ({ data }) => {
      this.enabled = data.enabled;
      this.epoch = data.epoch;
      this.offset = 0;
      this.holdoff = data.holdoff ?? 9;
      this.quietLimit = data.interrupting ? 20 : 32;
      this.reset();
    };
  }

  reset() {
    this.offset = this.leadOffset = this.leadLength = this.length = this.quiet = this.voiced = 0;
    this.floor = 0.002;
  }

  analyze() {
    const frame = this.frame;
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const rms = Math.sqrt(energy / frame.length);
    const voiced = rms >= Math.max(0.008, this.floor * 3);
    if (!voiced) this.floor = Math.max(0.001, this.floor * 0.97 + rms * 0.03);

    if (!this.length && !voiced) {
      this.preRoll.set(frame, this.leadOffset);
      this.leadOffset = (this.leadOffset + frame.length) % this.preRoll.length;
      this.leadLength = Math.min(this.leadLength + frame.length, this.preRoll.length);
      return;
    }
    if (!this.length) {
      if (this.leadLength < this.preRoll.length) {
        this.clip.set(this.preRoll.subarray(0, this.leadLength));
      } else {
        this.clip.set(this.preRoll.subarray(this.leadOffset));
        this.clip.set(this.preRoll.subarray(0, this.leadOffset), this.preRoll.length - this.leadOffset);
      }
      this.length = this.leadLength;
    }
    this.clip.set(frame, this.length);
    this.length += frame.length;
    this.quiet = voiced ? 0 : this.quiet + 1;
    if (voiced && ++this.voiced === 7) this.port.postMessage({ epoch: this.epoch, started: true });
    if (this.quiet < this.quietLimit && this.length < this.clip.length) return;
    if (this.voiced >= 7) {
      const samples = this.clip.slice(0, this.length);
      this.port.postMessage({ epoch: this.epoch, samples }, [samples.buffer]);
    }
    this.reset();
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!this.enabled || !channel) return true;
    for (const sample of channel) {
      this.frame[this.offset++] = sample;
      if (this.offset !== this.frame.length) continue;
      this.offset = 0;
      if (this.holdoff > 0) this.holdoff--;
      else this.analyze();
    }
    return true;
  }
}

registerProcessor('quin-wake-meter', QuinWakeMeter);
