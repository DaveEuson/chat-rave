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

2. Energy-driven arrangement, remaining instruments, five genres/key controls and transparent OBS visuals.
3. Musical Twitch events and event simulator.
4. Finished five-step onboarding, GitHub Pages verification, OBS setup and demo script.

Browser files already use relative paths and can be served statically. Full GitHub Pages and OBS validation is deferred to milestone 4. OAuth requires an exact registered redirect for each hosting URL. OBS has separate browser storage: login in a regular browser does not automatically authenticate an OBS source. A same-origin control/overlay flow within OBS remains milestone 2 work.

Everything is synthesized; no recordings are included. No optional local sample loader until after milestone 4, if time remains.

MIT licensed. Build decisions, validation and failures: [BUILD_LOG.md](BUILD_LOG.md).
