const ENDPOINT = 'wss://eventsub.wss.twitch.tv/ws';

export function chatEvent(message) {
  if (message?.metadata?.subscription_type !== 'channel.chat.message') return null;
  const event = message.payload?.event;
  if (!event || typeof event.message?.text !== 'string' || typeof event.chatter_user_login !== 'string') return null;
  // Ignore mirrored messages from another room in Shared Chat.
  if (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== event.broadcaster_user_id) return null;
  return { user: event.chatter_user_login, text: event.message.text,
    hasEmote: event.message.fragments?.some(fragment => fragment.type === 'emote') === true };
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
    this.onChat = onChat; this.onStatus = onStatus; this.sockets = new Set(); this.seen = new Set(); this.generation = 0;
  }
  async connect({ token, clientId }) {
    this.stop(); this.stopped = false; this.token = token; this.clientId = clientId;
    const generation = this.generation;
    this.onStatus('Validating Twitch login…');
    try {
      const user = await this.validate();
      if (this.stopped || generation !== this.generation) return;
      this.userId = user.user_id; this.loginName = user.login;
      this.validation = setInterval(() => this.validate().catch(() => {
        if (generation === this.generation) this.fail('Twitch session expired. Connect again.');
      }), 3600000);
      this.open();
    } catch { if (generation === this.generation) this.fail('Twitch login could not be validated. Connect again.'); }
  }
  async validate() {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.token}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Invalid session');
    const user = await response.json();
    if (user.client_id !== this.clientId || !user.user_id || !user.scopes?.includes('user:read:chat')) throw new Error('Invalid authorization');
    return user;
  }
  fail(message) { this.stop(); this.onStatus(message); }
  stop() {
    this.stopped = true; this.generation++;
    clearInterval(this.validation); clearTimeout(this.retry);
    for (const socket of this.sockets) { clearTimeout(socket.watchdog); socket.close(); }
    this.sockets.clear(); this.active = null; this.token = null; this.seen.clear(); this.attempt = 0;
  }
  open(url = ENDPOINT, migrating = false) {
    if (this.stopped) return;
    const generation = this.generation, socket = new WebSocket(url);
    this.sockets.add(socket);
    const alive = () => !this.stopped && generation === this.generation;
    let keepalive = 15;
    const watch = () => {
      clearTimeout(socket.watchdog);
      socket.watchdog = setTimeout(() => socket.close(), keepalive * 1000 + 2000);
    };
    watch();
    socket.onmessage = async ({ data }) => {
      if (!alive()) return;
      try {
        const message = JSON.parse(data), type = message.metadata?.message_type;
        watch();
        if (type === 'session_welcome') {
          const session = message.payload.session;
          keepalive = session.keepalive_timeout_seconds || 15; watch();
          const previous = this.active; this.active = socket;
          if (migrating && previous && previous !== socket) { clearTimeout(previous.watchdog); previous.close(); }
          if (!migrating) {
            const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
              method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.userId, user_id: this.userId }, transport: { method: 'websocket', session_id: session.id } }),
              signal: AbortSignal.timeout(8000)
            });
            if (!alive()) return;
            if (!response.ok) { this.fail(`Twitch subscription failed (${response.status}). Connect again.`); return; }
          }
          if (alive()) { this.attempt = 0; this.onStatus(`Connected to ${this.loginName}. Chat is live.`); }
        } else if (type === 'session_reconnect') {
          const next = new URL(message.payload.session.reconnect_url);
          if (next.protocol !== 'wss:' || next.hostname !== 'eventsub.wss.twitch.tv' || next.port || next.username || next.password) throw new Error('Invalid reconnect');
          this.open(next.href, true);
        } else if (type === 'revocation') {
          this.fail('Twitch authorization revoked. Connect again.');
        } else if (type === 'notification') {
          const id = message.metadata.message_id;
          if (!id || this.seen.has(id)) return;
          this.seen.add(id);
          if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
          const chat = chatEvent(message);
          if (chat) this.onChat(chat);
        }
      } catch { if (alive()) this.fail('Twitch connection error. Connect again.'); }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearTimeout(socket.watchdog); this.sockets.delete(socket);
      if (!alive() || (this.active && this.active !== socket)) return;
      this.active = null;
      this.onStatus('Twitch disconnected; reconnecting…');
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.open(), Math.min(30000, 1000 * 2 ** this.attempt++));
    };
  }
}
