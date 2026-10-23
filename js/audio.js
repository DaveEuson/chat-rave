import { frequency } from './music.js';

export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.mix = ctx.createGain(); this.mix.gain.value = 0.65;
    this.duck = ctx.createGain(); this.duck.connect(this.mix);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12; compressor.knee.value = 6;
    compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.1;
    // Bounded final transfer curve; compressor alone is not a brick-wall limiter.
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = Float32Array.from({ length: 8193 }, (_, i) => 0.8 * Math.tanh((i / 4096 - 1) / 0.8));
    this.volume = ctx.createGain(); this.volume.gain.value = 0.35;
    this.mix.connect(compressor).connect(ceiling).connect(this.volume).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.voices = 0;
  }
  level(value) { this.volume.gain.setTargetAtTime(Math.max(0, Math.min(0.7, value)), this.ctx.currentTime, 0.008); }
  voice(source, nodes, time, duration) {
    if (this.voices >= 48) { source.disconnect(); nodes.forEach(n => n.disconnect()); return; }
    this.voices++;
    source.onended = () => { this.voices--; source.disconnect(); nodes.forEach(n => n.disconnect()); };
    source.start(time); source.stop(time + duration);
  }
  kick(t) {
    const osc = this.ctx.createOscillator(), env = this.ctx.createGain();
    osc.frequency.setValueAtTime(155, t); osc.frequency.exponentialRampToValueAtTime(49, t + 0.055);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.36);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.95, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(env).connect(this.mix); this.voice(osc, [env], t, 0.45);
    this.percussion(t, 'click');
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.22, t);
    this.duck.gain.exponentialRampToValueAtTime(1, t + 0.23);
  }
  percussion(t, type = 'hat') {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), env = this.ctx.createGain();
    source.buffer = this.noise;
    filter.type = type === 'clap' ? 'bandpass' : 'highpass';
    filter.frequency.value = type === 'clap' ? 1600 : type === 'click' ? 2200 : 7500;
    filter.Q.value = type === 'clap' ? 0.7 : 0.5;
    const duration = type === 'clap' ? 0.19 : type === 'click' ? 0.016 : 0.07;
    const gain = type === 'clap' ? 0.34 : type === 'click' ? 0.13 : 0.12;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(gain, t + 0.001);
    if (type === 'clap') {
      for (const offset of [0.012, 0.025]) {
        env.gain.linearRampToValueAtTime(0.025, t + offset - 0.002);
        env.gain.linearRampToValueAtTime(gain, t + offset);
      }
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(env).connect(this.mix);
    this.voice(source, [filter, env], t, duration + 0.01);
  }
  bass(t, midi, pan = 0) {
    const osc = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain(), stereo = this.ctx.createStereoPanner();
    osc.type = 'sawtooth'; osc.frequency.value = frequency(midi);
    filter.type = 'lowpass'; filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(1100, t); filter.frequency.exponentialRampToValueAtTime(110, t + 0.24);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.32, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
    stereo.pan.value = pan * 0.3;
    osc.connect(filter).connect(env).connect(stereo).connect(this.duck);
    this.voice(osc, [filter, env, stereo], t, 0.31);
  }
}
