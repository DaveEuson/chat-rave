import { BPM, nextStep } from './music.js';

export class Sequencer {
  constructor(synth, onStep) { this.synth = synth; this.ctx = synth.ctx; this.onStep = onStep; this.queue = new Map(); }
  start() {
    this.origin = this.ctx.currentTime + 0.08; this.cursor = 0;
    this.timer = setInterval(() => this.tick(), 25); this.tick();
  }
  stop() { clearInterval(this.timer); this.queue.clear(); }
  target() { return Math.max(this.cursor, nextStep(this.ctx.currentTime + 0.015, this.origin)); }
  add(note) {
    const notes = this.queue.get(note.step) || [];
    if (notes.length >= 4) return false;
    notes.push(note); this.queue.set(note.step, notes); return true;
  }
  tick() {
    const duration = 60 / BPM / 4;
    // After suspension/throttling, skip missed notes instead of firing a burst.
    if (this.origin + this.cursor * duration < this.ctx.currentTime - duration) {
      this.cursor = nextStep(this.ctx.currentTime, this.origin);
      for (const step of this.queue.keys()) if (step < this.cursor) this.queue.delete(step);
    }
    while (this.origin + this.cursor * duration < this.ctx.currentTime + 0.1) {
      const t = this.origin + this.cursor * duration, step = this.cursor % 16;
      if (step % 4 === 0) this.synth.kick(t);
      if (step % 4 === 2) this.synth.percussion(t);
      if (step === 4 || step === 12) this.synth.percussion(t, 'clap');
      const notes = this.queue.get(this.cursor) || [];
      for (const note of notes) {
        if (note.command === 'hat') this.synth.percussion(t);
        else this.synth.bass(t, note.midi, note.pan);
      }
      this.queue.delete(this.cursor);
      this.onStep(step, t, notes); this.cursor++;
    }
  }
}
