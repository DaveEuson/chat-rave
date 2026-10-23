import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, ChatGate } from '../js/chat.js';
import { nextStep, scaleNote, identity, SCALE } from '../js/music.js';
import { Sequencer } from '../js/sequencer.js';

test('commands, emotes and untrusted messages', () => {
  for (const command of ['bass', 'lead', 'arp', 'hat', 'riser']) assert.equal(parseMessage(` !${command.toUpperCase()} `), command);
  assert.equal(parseMessage('hello'), 'note'); assert.equal(parseMessage('Kappa', true), 'hat');
  for (const text of ['', null, '!unknown', 'https://bad.test', 'join discord.gg/test', 'a'.repeat(10), 'x'.repeat(501)]) assert.equal(parseMessage(text), null);
});
test('quantization advances strictly to next step including bar wrap', () => {
  const d = 60 / 124 / 4;
  assert.equal(nextStep(0, 1), 0); assert.equal(nextStep(1, 1), 1);
  assert.equal(nextStep(1 + d * 15, 1), 16);
  assert.equal(nextStep(1 + d * 15.9, 1), 16);
  assert.equal(nextStep(1 + d * 16, 1), 17);
});
test('scale mapping handles negative degrees and octaves', () => {
  assert.equal(scaleNote(0), 33); assert.equal(scaleNote(7), 45); assert.equal(scaleNote(-1), 31);
  for (let n = -40; n < 40; n++) assert.ok(SCALE.includes(((scaleNote(n) - 33) % 12 + 12) % 12));
  assert.deepEqual(identity('Raver'), identity('raver'));
});
test('rate limits, duplicate spam, per-bar cap and invalid usernames', () => {
  const gate = new ChatGate(), msg = { user: 'alice', text: 'hello' };
  assert.ok(gate.accept(msg, 1, 0)); assert.equal(gate.accept(msg, 2, 100), null);
  assert.equal(gate.accept(msg, 2, 2000), null);
  assert.ok(gate.accept({ ...msg, text: 'different' }, 2, 2000));
  for (let i = 0; i < 22; i++) assert.ok(gate.accept({ user: `user_${i}`, text: 'yo' }, 2, 3000));
  assert.equal(gate.accept({ user: 'extra', text: 'yo' }, 3, 3000), null);
  assert.ok(gate.accept({ user: 'extra', text: 'yo' }, 16, 3000));
  assert.equal(gate.accept({ user: '<script>', text: 'yo' }, 16, 5000), null);
});

test('scheduler caps chords, respects lookahead and skips stalled notes', () => {
  const played = [];
  const synth = { ctx: { currentTime: 0 }, kick: () => {}, percussion: () => {}, bass: (...args) => played.push(args) };
  const sequence = new Sequencer(synth, () => {});
  sequence.origin = 0.08; sequence.cursor = 0;
  for (let i = 0; i < 4; i++) assert.equal(sequence.add({ step: 0, midi: 33, pan: 0, command: 'bass' }), true);
  assert.equal(sequence.add({ step: 0 }), false);
  sequence.tick(); assert.equal(played.length, 4);
  assert.equal(sequence.target(), 1, 'cannot add to an already scheduled step');
  sequence.add({ step: 1, midi: 40, command: 'bass' });
  synth.ctx.currentTime = 10; sequence.tick();
  assert.equal(played.length, 4, 'must not burst overdue notes after browser suspension');
  assert.equal(sequence.queue.size, 0);
});
