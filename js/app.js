import { Synth } from './audio.js';
import { Sequencer } from './sequencer.js';
import { ChatGate } from './chat.js';
import { login, consumeLogin, TwitchChat } from './twitch.js';

const $ = id => document.getElementById(id);
const cells = Array.from({ length: 16 }, (_, i) => {
  const cell = document.createElement('div'); cell.className = `step${i % 4 === 0 ? ' beat' : ''}`;
  cell.textContent = String(i + 1).padStart(2, '0'); $('grid').append(cell); return cell;
});
let synth, sequencer, gate = new ChatGate(), crowd, muted = false, running = false;
let visualQueue = [];
function draw() {
  if (synth && running) {
    while (visualQueue.length && visualQueue[0].t <= synth.ctx.currentTime) {
      const { step, notes } = visualQueue.shift();
      cells.forEach((cell, i) => cell.classList.toggle('active', i === step));
      if (notes.length) $('played').replaceChildren(...notes.flatMap((n, i) => {
        const mark = document.createElement('span');
        mark.textContent = '● '; mark.style.color = n.color;
        return [document.createTextNode(i ? ' · ' : ''), mark,
          document.createTextNode(`${n.user} → ${n.command === 'hat' ? 'hat' : 'bass'}`)];
      }));
    }
  }
  requestAnimationFrame(draw);
}
draw();
function receive(message) {
  if (!running || muted) { $('input-status').textContent = 'Start or unmute audio first.'; return; }
  const note = gate.accept(message, sequencer.target(), performance.now());
  $('input-status').textContent = note && sequencer.add(note) ? `${message.user}: queued on step ${note.step % 16 + 1}` : 'Message skipped: rate limit, repeated text, link, spam or full step/bar.';
}
$('start').onclick = async () => {
  try {
    if (!synth) synth = new Synth(new AudioContext());
    await synth.ctx.resume();
    if (running && !muted) {
      sequencer.stop(); running = false; synth.level(0); visualQueue = [];
      $('start').textContent = 'Start audio'; $('audio-status').textContent = 'Stopped.'; return;
    }
    if (!running) {
      gate = new ChatGate();
      sequencer = new Sequencer(synth, (step, t, notes) => { if (visualQueue.length > 64) visualQueue = []; visualQueue.push({ step, t, notes }); });
      sequencer.start(); running = true;
    }
    muted = false; synth.level(Number($('volume').value) / 100);
    $('start').textContent = 'Stop audio'; $('audio-status').textContent = 'Playing · House 124 BPM · A minor. Send chat to add bass.';
  } catch { $('audio-status').textContent = 'Audio could not start. Try a current browser and click Start again.'; }
};
$('panic').onclick = () => { muted = true; if (synth) synth.level(0); if (sequencer) sequencer.queue.clear(); $('start').textContent = 'Unmute audio'; $('audio-status').textContent = 'PANIC MUTED. Click Unmute audio to resume.'; };
$('volume').oninput = () => { const value = Number($('volume').value); $('volume-value').textContent = `${value}%`; if (synth && !muted && running) synth.level(value / 100); };
$('chat-form').onsubmit = e => { e.preventDefault(); receive({ user: $('username').value, text: $('message').value }); };
$('simulate').onclick = () => {
  if (crowd) { clearInterval(crowd); crowd = null; }
  else { let i = 0; crowd = setInterval(() => { i++; receive({ user: `raver_${i % 12}`, text: i % 5 === 0 ? '!hat' : `dance ${i}` }); }, 310); }
  $('simulate').textContent = crowd ? 'Stop simulated crowd' : 'Start simulated crowd'; $('simulate').setAttribute('aria-pressed', String(Boolean(crowd)));
};
$('redirect').textContent = location.origin + location.pathname;
const twitch = new TwitchChat(receive, message => {
  $('twitch-status').textContent = message;
  $('disconnect').disabled = twitch.stopped;
});
$('connect').onclick = () => {
  try { login($('client-id').value.trim(), $('redirect').textContent); }
  catch (error) { $('twitch-status').textContent = error.message; }
};
$('disconnect').onclick = () => { twitch.stop(); $('disconnect').disabled = true; $('twitch-status').textContent = 'Disconnected. Session token discarded.'; };
try {
  const session = consumeLogin();
  if (session) { $('client-id').value = session.clientId; twitch.connect(session); }
} catch (error) { $('twitch-status').textContent = error.message; }
window.addEventListener('pagehide', () => twitch.stop());
