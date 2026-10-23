import { hash, identity, scaleNote } from './music.js';

export function playerColor(user, color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
    ? color : `hsl(${hash(user) % 360} 75% 72%)`;
}

export function parseMessage(text, hasEmote = false) {
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return null;
  if (/(?:https?:|www\.|\b[\w-]+\.(?:com|net|org|gg|io)\b)|([\s\S])\1{9}/i.test(text)) return null;
  const command = text.trim().toLowerCase().match(/^!(\w+)\b/);
  if (command) return ['bass', 'lead', 'arp', 'hat', 'riser'].includes(command[1]) ? command[1] : null;
  return hasEmote ? 'hat' : 'note';
}

export class ChatGate {
  constructor() { this.users = new Map(); this.bar = -1; this.count = 0; }
  accept({ user, text, hasEmote = false, color }, step, now) {
    if (typeof user !== 'string' || !/^[a-zA-Z0-9_]{1,25}$/.test(user)) return null;
    const command = parseMessage(text, hasEmote);
    if (!command) return null;
    const id = user.toLowerCase();
    const last = this.users.get(id);
    if (last && (now - last.time < 1500 || (last.text === text && now - last.time < 10000))) return null;
    const bar = Math.floor(step / 16);
    if (bar !== this.bar) { this.bar = bar; this.count = 0; }
    if (this.count >= 24) return null;
    if (this.users.size >= 2000) {
      for (const [key, value] of this.users) if (now - value.time >= 10000) this.users.delete(key);
      if (this.users.size >= 2000) return null;
    }
    this.users.set(id, { time: now, text }); this.count++;
    return { user, command, color: playerColor(user, color), ...identity(user), midi: scaleNote(hash(text) % 7), step };
  }
}
