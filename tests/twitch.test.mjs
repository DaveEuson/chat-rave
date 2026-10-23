import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChat, chatEvent, consumeLogin } from '../js/twitch.js';
import { ChatGate, playerColor } from '../js/chat.js';

const notification = { metadata: { message_type: 'notification', message_id: 'message-1', subscription_type: 'channel.chat.message' },
  payload: { event: { chatter_user_login: 'raver', broadcaster_user_id: '123', message: { text: 'Kappa', fragments: [{ type: 'emote' }] } } } };

test('chat events normalize emotes and ignore other/shared rooms', () => {
  assert.deepEqual(chatEvent(notification), { user: 'raver', text: 'Kappa', hasEmote: true, color: playerColor('raver') });
  assert.equal(chatEvent({}), null);
  const mirrored = structuredClone(notification); mirrored.payload.event.source_broadcaster_user_id = '999';
  assert.equal(chatEvent(mirrored), null);
});

test('EventSub subscribes as broadcaster, deduplicates, migrates and discards session', async t => {
  const sockets = [], requests = [], received = [], statuses = [];
  class Socket {
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.closed = true; this.onclose?.(); }
    async send(message) { await this.onmessage({ data: JSON.stringify(message) }); }
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ client_id: 'test-client', user_id: '123', login: 'test', scopes: ['user:read:chat'], expires_in: 14400 }) };
  });
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = originalSocket; });
  const chat = new TwitchChat(message => received.push(message), message => statuses.push(message));
  t.after(() => chat.stop());
  await chat.connect({ token: 'synthetic-test-value', clientId: 'test-client' });
  const welcome = { metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'socket-1', keepalive_timeout_seconds: 10 } } };
  await sockets[0].send(welcome);
  const subscription = JSON.parse(requests[1].options.body);
  assert.equal(subscription.type, 'channel.chat.message');
  assert.deepEqual(subscription.condition, { broadcaster_user_id: '123', user_id: '123' });
  await sockets[0].send(notification); await sockets[0].send(notification);
  assert.equal(received.length, 1);
  await sockets[0].send({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=test' } } });
  await sockets[1].send(welcome);
  assert.equal(sockets[0].closed, true); assert.equal(requests.length, 2, 'migration must not resubscribe');
  assert.match(statuses.at(-1), /Connected/);
  await sockets[1].send({ metadata: { message_type: 'revocation' } });
  assert.match(statuses.at(-1), /revoked/);
  assert.equal(chat.token, null); assert.equal(sockets[1].closed, true);
});

test('emotes require emote fragments; safe color and fallback reach queued visuals', () => {
  const message = structuredClone(notification);
  message.payload.event.color = '#9146FF';
  message.payload.event.message.fragments = [{ type: 'text', text: 'Kappa' }];
  const chat = chatEvent(message);
  assert.equal(chat.hasEmote, false); assert.equal(chat.color, '#9146FF');
  assert.equal(new ChatGate().accept(chat, 1, 0).color, '#9146FF');
  message.payload.event.color = 'url(https://bad.test)';
  message.payload.event.message.fragments = {};
  assert.equal(chatEvent(message).color, playerColor('raver', ''));
  assert.equal(chatEvent(message).hasEmote, false);
  assert.equal(playerColor('RAVER'), playerColor('raver'));
});

const welcome = { metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'session', keepalive_timeout_seconds: 10 } } };
const keepalive = { metadata: { message_type: 'session_keepalive' } };
const reconnect = { metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=handover' } } };
const credentials = { token: 'synthetic-test-value', clientId: 'test-client' };

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const sockets = [], requests = [], statuses = [], received = [];
  class Socket {
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.closed = true; }
    async send(message) { await this.onmessage?.({ data: JSON.stringify(message) }); }
    end(code) { this.closed = true; this.onclose?.({ code }); }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = original; });
  const harness = { sockets, requests, statuses, received };
  harness.validate = async () => ({ ok: true, status: 200, json: async () => ({ ...credentials, client_id: 'test-client', user_id: '123', login: 'raver', scopes: ['user:read:chat'], expires_in: 36000 }) });
  harness.subscribe = async () => ({ ok: true, status: 202 });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options, time: Date.now() });
    return url.endsWith('/validate') ? harness.validate() : harness.subscribe(options);
  });
  harness.chat = new TwitchChat(value => received.push(value), value => statuses.push(value));
  t.after(() => harness.chat.stop());
  harness.tick = async ms => { t.mock.timers.tick(ms); for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return harness;
}

test('welcome subscribes immediately once; keepalive loss closes before reconnect and resubscribes', async t => {
  const h = setup(t); await h.chat.connect(credentials);
  await h.sockets[0].send(welcome); await h.sockets[0].send(welcome);
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].time, 0);
  await h.tick(9000); await h.sockets[0].send(keepalive);
  await h.tick(9000); assert.equal(h.sockets.length, 1);
  await h.tick(1000); assert.equal(h.sockets[0].closed, true);
  await h.tick(1000); assert.equal(h.sockets.length, 2);
  await h.sockets[1].send(welcome);
  assert.equal(h.requests.filter(r => r.url.endsWith('/subscriptions')).length, 2);
  assert.equal(h.sockets.filter(s => !s.closed).length, 1);
});

test('stalled subscribe aborts at eight seconds; late success cannot resurrect retired socket', async t => {
  const h = setup(t); let resolve;
  h.subscribe = () => new Promise(done => { resolve = done; });
  await h.chat.connect(credentials);
  const pending = h.sockets[0].send(welcome);
  await h.tick(8000);
  assert.equal(h.requests[1].options.signal.aborted, true);
  assert.equal(h.sockets[0].closed, true);
  resolve({ ok: true, status: 202 }); await pending;
  assert.equal(h.statuses.some(s => s.startsWith('Connected')), false);
});

test('duplicate reconnect creates one handover; failed migration recovers a fresh subscription', async t => {
  const h = setup(t); await h.chat.connect(credentials); await h.sockets[0].send(welcome);
  await h.sockets[0].send(reconnect); await h.sockets[0].send(reconnect);
  assert.equal(h.sockets.length, 2); assert.equal(h.sockets[0].closed, undefined);
  assert.equal(h.sockets[1].url, reconnect.payload.session.reconnect_url);
  h.sockets[1].end(4007);
  assert.ok(h.sockets.every(s => s.closed));
  await h.tick(1000); await h.sockets[2].send(welcome);
  assert.equal(h.requests.filter(r => r.url.endsWith('/subscriptions')).length, 2);
});

test('old socket close during migration does not create a third connection', async t => {
  const h = setup(t); await h.chat.connect(credentials); await h.sockets[0].send(welcome);
  await h.sockets[0].send(reconnect); h.sockets[0].end(4004);
  await h.sockets[1].send(welcome); await h.tick(1000);
  assert.equal(h.sockets.length, 2); assert.equal(h.chat.active, h.sockets[1]);
  assert.equal(h.requests.length, 2);
});

test('transient close codes recover; protocol failures stop instead of looping', async t => {
  const h = setup(t); await h.chat.connect(credentials);
  for (const code of [1006, 4000, 4003, 4004, 4005, 4006, 4007]) {
    const socket = h.sockets.at(-1); await socket.send(welcome); socket.end(code);
    await h.tick(1000); assert.notEqual(h.sockets.at(-1), socket);
  }
  await h.sockets.at(-1).send(welcome); h.sockets.at(-1).end(4001);
  const count = h.sockets.length; await h.tick(60000);
  assert.equal(h.sockets.length, count); assert.equal(h.chat.token, null);
});

test('four-hour stream validates hourly with one steady socket; transient validation failure retries', async t => {
  const h = setup(t); await h.chat.connect(credentials); await h.sockets[0].send(welcome);
  for (let i = 0; i < 1600; i++) { await h.tick(9000); await h.sockets[0].send(keepalive); }
  assert.equal(h.requests.filter(r => r.url.endsWith('/validate')).length, 5);
  assert.equal(h.sockets.length, 1);
  h.validate = async () => { throw new Error('Network offline'); };
  await h.chat.validateSession(); assert.equal(h.chat.token, credentials.token);
  h.validate = async () => ({ ok: false, status: 401 });
  for (let i = 0; i < 4; i++) { await h.tick(9000); await h.sockets[0].send(keepalive); }
  assert.equal(h.chat.token, null); assert.equal(h.chat.stopped, true);
});

test('subscription server failure retries; authorization failure clears credentials', async t => {
  const h = setup(t); h.subscribe = async () => ({ ok: false, status: 503 });
  await h.chat.connect(credentials); await h.sockets[0].send(welcome);
  assert.equal(h.chat.stopped, false); await h.tick(1000);
  h.subscribe = async () => ({ ok: false, status: 401 });
  await h.sockets[1].send(welcome);
  assert.equal(h.chat.token, null); assert.match(h.statuses.at(-1), /401/);
});

test('disconnect cancels validation response and pending retries', async t => {
  const h = setup(t); let resolve;
  h.validate = () => new Promise(done => { resolve = done; });
  const pending = h.chat.connect(credentials); h.chat.stop();
  resolve({ ok: true, json: async () => ({ client_id: 'test-client' }) });
  await pending; await h.tick(7200000);
  assert.equal(h.sockets.length, 0); assert.equal(h.chat.token, null);
});

test('rate limit waits for reset; expiry disposes token without reconnect loop', async t => {
  const h = setup(t);
  h.subscribe = async () => ({ ok: false, status: 429, headers: { get: () => '60' } });
  await h.chat.connect(credentials); await h.sockets[0].send(welcome);
  await h.tick(59000); assert.equal(h.sockets.length, 1);
  await h.tick(1000); assert.equal(h.sockets.length, 2);
  h.subscribe = async () => ({ ok: true, status: 202 });
  await h.sockets[1].send(welcome);
  h.validate = async () => ({ ok: true, json: async () => ({ client_id: 'test-client', user_id: '123', login: 'raver', scopes: ['user:read:chat'], expires_in: 3 }) });
  await h.chat.validateSession(); await h.tick(3000);
  assert.equal(h.chat.token, null); assert.match(h.statuses.at(-1), /expired/);
  await h.tick(60000); assert.equal(h.sockets.length, 2);
});

test('revocation reasons stop and discard session', async t => {
  const h = setup(t);
  for (const [status, expected] of [['authorization_revoked', /revoked/], ['user_removed', /account removed/], ['version_removed', /update required/]]) {
    await h.chat.connect(credentials); await h.sockets.at(-1).send(welcome);
    await h.sockets.at(-1).send({ metadata: { message_type: 'revocation' }, payload: { subscription: { status } } });
    assert.match(h.statuses.at(-1), expected); assert.equal(h.chat.token, null);
  }
});

test('OAuth callback rejects state mismatch and removes fragment', t => {
  const saved = new Map([['rave-oauth', JSON.stringify({ state: 'expected', created: Date.now(), clientId: 'public-id' })]]);
  const original = { location: globalThis.location, history: globalThis.history, sessionStorage: globalThis.sessionStorage };
  let replacement;
  globalThis.location = { hash: '#access_token=synthetic-test-value&state=wrong', search: '', pathname: '/' };
  globalThis.history = { replaceState: (_, __, path) => { replacement = path; } };
  globalThis.sessionStorage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key) };
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  assert.throws(consumeLogin, /could not be verified/);
  assert.equal(replacement, '/'); assert.equal(saved.size, 0);
});
