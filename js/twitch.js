import { playerColor } from './chat.js';

const ENDPOINT = 'wss://eventsub.wss.twitch.tv/ws';

export function chatEvent(message) {
  if (message?.metadata?.subscription_type !== 'channel.chat.message') return null;
  const event = message.payload?.event;
  if (!event || typeof event.message?.text !== 'string' || event.message.text.length > 500 ||
      typeof event.chatter_user_login !== 'string' || !/^[a-z0-9_]{1,25}$/i.test(event.chatter_user_login)) return null;
  // Ignore mirrored messages from another room in Shared Chat.
  if (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== event.broadcaster_user_id) return null;
  return { user: event.chatter_user_login, text: event.message.text,
    color: playerColor(event.chatter_user_login, event.color),
    hasEmote: Array.isArray(event.message.fragments) && event.message.fragments.some(fragment => fragment?.type === 'emote') };
}

export function login(clientId, redirect) {
  if (!/^[a-zA-Z0-9]{10,64}$/.test(clientId)) throw new Error('Enter the public client ID from your Twitch application.');
  const state = crypto.randomUUID();
  sessionStorage.setItem('rave-oauth', JSON.stringify({ state, clientId, created: Date.now() }));
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'token', scope: 'user:read:chat', state });
  location.assign(`https://id.twitch.tv/oauth2/authorize?${params}`);
}

export function consumeLogin() {
  const params = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  if (!params.has('access_token') && !params.has('error') && !query.has('error')) return null;
  history.replaceState(null, '', location.pathname); // Remove credential fragment before any UI work.
  const pending = sessionStorage.getItem('rave-oauth');
  sessionStorage.removeItem('rave-oauth');
  if (params.has('error') || query.has('error')) throw new Error('Twitch login cancelled or declined.');
  const request = pending ? JSON.parse(pending) : null;
  if (!request || request.state !== params.get('state') || Date.now() - request.created > 600000) throw new Error('Login expired or could not be verified. Connect again.');
  return { token: params.get('access_token'), clientId: request.clientId };
}

export class TwitchChat {
  constructor(onChat, onStatus) {
    this.onChat = onChat; this.onStatus = onStatus;
    this.sockets = new Set(); this.seen = new Map(); this.generation = 0; this.stopped = true;
  }
  async connect({ token, clientId }) {
    this.stop(); this.stopped = false; this.token = token; this.clientId = clientId;
    this.onStatus('Validating Twitch login…');
    await this.validateSession();
  }
  async validateSession() {
    if (this.stopped || this.validating) return;
    const generation = this.generation, controller = new AbortController();
    this.validating = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    const alive = () => !this.stopped && generation === this.generation;
    let delay = 3600000;
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${this.token}` }, signal: controller.signal
      });
      if (!alive()) return;
      if (response.status === 401 || response.status === 403) { this.fail('Twitch session expired or revoked. Connect again.'); return; }
      if (!response.ok) throw new Error('Validation unavailable');
      const user = await response.json();
      if (!alive()) return;
      if (user.client_id !== this.clientId || !user.user_id || !user.scopes?.includes('user:read:chat') ||
          (this.userId && user.user_id !== this.userId) || !Number.isFinite(user.expires_in) || user.expires_in <= 0) {
        this.fail('Twitch authorization invalid. Connect again.'); return;
      }
      this.userId = user.user_id; this.loginName = user.login;
      clearTimeout(this.expiry);
      this.expiry = setTimeout(() => this.fail('Twitch session expired. Connect again; local music continues.'), Math.min(user.expires_in * 1000, 2147483647));
      delay = Math.min(3600000, user.expires_in * 1000);
      if (!this.sockets.size && !this.retry) this.open();
    } catch {
      if (alive()) { delay = 30000; this.onStatus('Twitch validation unavailable; retrying in 30 seconds.'); }
    } finally {
      clearTimeout(timeout);
      if (alive()) {
        this.validating = null; clearTimeout(this.validation);
        this.validation = setTimeout(() => this.validateSession(), delay);
      }
    }
  }
  fail(message) { this.stop(); this.onStatus(message); }
  stop() {
    this.stopped = true; this.generation++;
    clearTimeout(this.validation); clearTimeout(this.expiry); clearTimeout(this.retry); this.retry = null;
    this.validating?.abort(); this.validating = null;
    for (const socket of [...this.sockets]) this.retire(socket);
    this.active = null; this.pending = null; this.token = null; this.userId = null; this.seen.clear(); this.attempt = 0;
  }
  retire(socket) {
    this.sockets.delete(socket);
    clearTimeout(socket.watchdog); clearTimeout(socket.deadline); socket.request?.abort();
    socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close();
  }
  recover(message, minimumDelay = 0) {
    if (this.stopped || this.retry) return;
    for (const socket of [...this.sockets]) this.retire(socket);
    this.active = this.pending = null;
    this.onStatus(message);
    const delay = Math.max(minimumDelay, Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)));
    this.retry = setTimeout(() => { this.retry = null; this.open(); }, delay);
  }
  open(url = ENDPOINT, migrating = false) {
    if (this.stopped || this.pending || (!migrating && this.sockets.size)) return;
    const generation = this.generation;
    let socket;
    try { socket = new WebSocket(url); }
    catch { this.recover('Twitch connection unavailable; retrying…'); return; }
    this.sockets.add(socket); this.pending = socket;
    const alive = () => !this.stopped && generation === this.generation && this.sockets.has(socket);
    let keepalive = 10, welcomed = false;
    const watch = () => {
      clearTimeout(socket.watchdog);
      socket.watchdog = setTimeout(() => {
        if (alive()) this.recover('Twitch keepalive missed; reconnecting and resubscribing…');
      }, keepalive * 1000);
    };
    socket.deadline = setTimeout(() => {
      if (alive()) this.recover('Twitch welcome timed out; reconnecting…');
    }, 10000);
    socket.onmessage = async ({ data }) => {
      if (!alive()) return;
      try {
        const message = JSON.parse(data), type = message.metadata?.message_type;
        if (type === 'session_welcome') {
          if (welcomed) return;
          const session = message.payload?.session;
          if (!session?.id || !Number.isFinite(session.keepalive_timeout_seconds) || session.keepalive_timeout_seconds <= 0) throw new Error('Invalid welcome');
          welcomed = true; keepalive = session.keepalive_timeout_seconds; watch();
          clearTimeout(socket.deadline);
          if (!migrating) {
            // Start subscription immediately. Abort/recover at 8s, before Twitch's 10s deadline.
            socket.request = new AbortController();
            socket.deadline = setTimeout(() => {
              if (alive()) this.recover('Twitch subscription timed out; reconnecting…');
            }, 8000);
            const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
              method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.userId, user_id: this.userId }, transport: { method: 'websocket', session_id: session.id } }),
              signal: socket.request.signal
            });
            if (!alive()) return;
            clearTimeout(socket.deadline);
            if (!response.ok) {
              if (response.status === 429 || response.status >= 500) {
                const reset = Number(response.headers?.get('Ratelimit-Reset')) * 1000 - Date.now();
                this.recover(`Twitch temporarily unavailable (${response.status}); retrying…`, response.status === 429 ? Math.max(30000, Math.min(300000, reset || 0)) : 0);
              } else this.fail(`Twitch subscription rejected (${response.status}). Connect again.`);
              return;
            }
          }
          if (!alive()) return;
          const previous = this.active;
          this.active = socket; this.pending = null;
          if (previous && previous !== socket) this.retire(previous);
          this.attempt = 0; this.onStatus(`Connected to ${this.loginName}. Chat is live.`);
        } else if (type === 'session_reconnect' && welcomed) {
          if (this.pending) return; // One migration at a time, even for duplicate reconnect messages.
          const reconnectUrl = message.payload?.session?.reconnect_url, next = new URL(reconnectUrl);
          if (next.protocol !== 'wss:' || next.hostname !== 'eventsub.wss.twitch.tv' || next.port || next.username || next.password) throw new Error('Invalid reconnect');
          this.open(reconnectUrl, true); // Preserve Twitch's URL exactly; inherited subscriptions need no POST.
        } else if (type === 'revocation') {
          const reason = message.payload?.subscription?.status;
          this.fail(reason === 'version_removed' ? 'Twitch subscription version removed. App update required.' :
            reason === 'user_removed' ? 'Twitch account removed. Connect another account.' : 'Twitch authorization revoked. Connect again.');
        } else if (type === 'session_keepalive' && welcomed) {
          watch();
        } else if (type === 'notification' && welcomed) {
          watch();
          const id = message.metadata.message_id;
          if (!id || this.seen.has(id)) return;
          const now = Date.now();
          for (const [key, time] of this.seen) { if (now - time < 600000) break; this.seen.delete(key); }
          this.seen.set(id, now);
          if (this.seen.size > 20000) this.seen.delete(this.seen.keys().next().value);
          const chat = chatEvent(message);
          if (chat) this.onChat(chat);
        }
      } catch { if (alive()) this.recover('Twitch connection error; reconnecting…'); }
    };
    socket.onerror = () => { if (alive()) this.recover('Twitch network error; reconnecting…'); };
    socket.onclose = ({ code } = {}) => {
      if (!alive()) return;
      // The old edge can close while its requested handover is still connecting.
      if (socket === this.active && this.pending && this.pending !== socket) {
        this.retire(socket); this.active = null; return;
      }
      if (code === 4001 || code === 4002) {
        this.fail(`Twitch protocol error (${code}). Reload or update the browser.`); return;
      }
      this.recover(`Twitch connection closed (${code || 1006}); reconnecting and resubscribing…`);
    };
  }
}
