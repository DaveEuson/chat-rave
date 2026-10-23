# Chat Rave

Twitch chat plays a synthesized electronic set. Milestone 1 listening build: house, 124 BPM, A minor. No audio assets, runtime dependencies, paid APIs or build step.

## Run in five steps

1. Install Node.js 22 or newer and clone/download this repository.
2. Open a terminal in the repository and run `npm start`.
3. Open `http://localhost:8080/` and click **Start audio**.
4. Click **Start simulated crowd**, or send messages through the simulate form. Hear kick, clap, hats and scale-locked bass. **PANIC MUTE** silences output; volume cannot unmute it.
5. For real chat, register a Twitch application at https://dev.twitch.tv/console/apps with the exact redirect `http://localhost:8080/`. Enter its **public client ID** in the page, click **Connect Twitch**, and authorize your broadcaster account. After returning, click **Start audio**, then send messages in your own Twitch channel. Do not paste access tokens or client secrets anywhere.

`npm test` runs Node's built-in test runner. Live Twitch login is user-operated and remains to be verified with a real account.

## Current scope

- Native Web Audio drums, saw bass, kick-driven bass ducking, compressor, bounded output transfer curve, volume and panic mute.
- One 16-step audio clock. Messages land on the next schedulable step (a short lookahead prevents jitter).
- Per-user cooldown: 1.5 seconds; repeated text: 10 seconds; maximum 24 chat notes/bar, 4/step, 48 active sound sources.
- `!bass`, `!lead`, `!arp`, `!hat`, `!riser` parsed. In this first listening build all pitched/FX commands audition bass; `!hat` and Twitch emotes trigger hats.
- EventSub chat, session validation, reconnect handling and duplicate suppression. Hype Train/sub/cheer/raid sounds arrive in milestone 3.
- Start muted after refresh; OAuth token stays in memory and reconnect requires another login after reload. Only OAuth state and public client ID temporarily use session storage. No `.env` file is needed or served.

## Next milestones

Before new features: deterministic event-driven engine. One seed plus ordered musical events determines all choices, including synthesized noise. Current milestone 1 noise still uses Math.random and current note mapping uses chat text; both must be replaced. Replay will target the same musical result; Web Audio implementations/sample rates may produce small sample-level differences across browsers.

2. Energy-driven arrangement, remaining instruments, five genres/key controls, transparent OBS visuals, device-code login, compact JSON set logging and master-output audio recording through MediaRecorder. Set downloads are local. Real usernames require explicit opt-in; default player IDs are session-local aliases, not username hashes. No raw chat or Twitch IDs in default exports.
3. Musical Twitch events, event simulator and `replay.html`: import a set without Twitch login and play through the same synth/visuals. Short sets can be encoded in URL fragments; large sets remain downloadable files or explicitly user-hosted links. Nothing uploads automatically. Offline WAV render is stretch scope.
4. Finished five-step onboarding, GitHub Pages/OBS verification and feature-complete code by **October 31**. **November 1–2:** demo video, YouTube upload, description and Devpost submission before November 2, 2 PM PT.

### Set format requirements (planned)

Versioned header: engine version, seed, initial tempo/key/preset, duration. Ordered events: bar, step, optional substep ticks, event type, anonymous player ID, resolved instrument/note/pan and relevant parameters. Include control changes, volume/panic automation and events that affect arrangement; rejected input may be represented by anonymous event/rejection metadata without raw text. Preserve order for simultaneous events. Anonymous IDs must drive identity-based music so exported sets need no private username mapping. Loading validates schema, event count, duration and parameter bounds.

Hype Train mapping: **begin → short riser → drop; level-up → bigger drop; end → breakdown**. No drop on end. Musical transitions quantize to the clock; duplicate or stale notifications cannot retrigger them.

Browser files already use relative paths and can be served statically. Full GitHub Pages and OBS validation is deferred to milestone 4. Current implicit OAuth requires an exact registered redirect for each hosting URL and cannot silently renew its token. OBS has separate browser storage: normal-browser login does not authenticate an OBS source.

### Planned OBS authentication replacement

`overlay.html` will own the Twitch session. With a Twitch application registered as a **Public** client, the source requests a device code; streamer opens Twitch's activation page in a normal browser and approves. The OBS source polls Twitch at the supplied interval and receives access/refresh tokens directly. No token transfer from another browser, client secret, storage, URL token or token in set exports. Setup code display must be used off-air and cleared after login.

The source validates on connection and hourly, handles expiration/401 with a single refresh request, retains the rotated refresh token in memory, and reconnects/resubscribes when necessary. Revocation or failed refresh clears credentials and requests authorization again; music/recording continue locally while live chat is unavailable. Lost events are not replayed by Twitch. Reloading the source or shutting OBS down clears tokens and requires login again; keep OBS's source shutdown/refresh-on-scene-change options disabled for uninterrupted sessions. Browser/OBS end-to-end verification remains required.

Twitch documents public-client device authorization and secret-free refresh in [Device Code Grant Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow). This replaces the current implicit flow; public clients cannot use implicit OAuth.

Everything is synthesized; no recordings are included. No optional local sample loader until after milestone 4, if time remains.

MIT licensed. Build decisions, validation and failures: [BUILD_LOG.md](BUILD_LOG.md).
