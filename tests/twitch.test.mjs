import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChat, chatEvent, consumeLogin } from '../js/twitch.js';

const notification = { metadata: { message_type: 'notification', message_id: 'message-1', subscription_type: 'channel.chat.message' },
  payload: { event: { chatter_user_login: 'raver', broadcaster_user_id: '123', message: { text: 'Kappa', fragments: [{ type: 'emote' }] } } } };

test('chat events normalize emotes and ignore other/shared rooms', () => {
  assert.deepEqual(chatEvent(notification), { user: 'raver', text: 'Kappa', hasEmote: true });
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
    return { ok: true, json: async () => ({ client_id: 'test-client', user_id: '123', login: 'test', scopes: ['user:read:chat'] }) };
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
