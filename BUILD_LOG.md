# Chat Rave build log

## 2026-10-23 — Plan approved; milestone 1 in progress
- Fresh workspace at `C:/Users/davee/Projects/Twitchcon`; no pre-existing code or Git repository. Node v24.20.0 available; Python unavailable.
- Read Twitch chat authentication, OAuth implicit flow, EventSub subscription types, WebSocket lifecycle and token validation documentation directly.
- Chosen: native Web Audio + browser EventSub, no dependencies/build, no shipped audio. Runtime OAuth tokens in memory only.
- Milestones: 1 chat/drums/bass (stop for listening); 2 arrangement/visuals; 3 Hype Train/subs/cheers/raids; 4 five-step README/Pages/demo.
- First slice: synthesized house drums and bass, 16-step scheduling, simulator, input caps, bounded output stage, volume and panic mute. Tests cover parsing, quantization, scale mapping and input limits.
- Temporary scope: all pitched commands play bass. Twitch connection follows in next slice. No claim of live Twitch verification yet.
- Validation: `npm test` passed 4/4 tests. Started local server and exercised Start audio, simulated crowd, visible queued/played bass and hat messages, and panic mute in the in-app browser. AudioContext started; musical quality awaits user listening. Python launch was unavailable, so local serving uses Node's standard library.
- First commit: `0bb1130`. Git initially rejected differing sandbox ownership, then denied `.git` writes. Used a command-scoped safe-directory override and approved elevated local commit; no global configuration changes.

## Slice 2 — Twitch chat wiring
- Added broadcaster OAuth with CSRF state check, immediate fragment removal, in-memory token, startup/hourly validation, EventSub chat subscription, keepalive watchdog, capped reconnect backoff, session migration and notification deduplication.
- Twitch emote fragments trigger hats. Shared Chat messages originating elsewhere are ignored. UI writes chat names with textContent.
- Added mocked transport tests and OAuth rejection test. Live broadcaster login remains user-operated; no access token or client secret requested or inspected.
- Added initial five-step README. Milestones 2–4 remain unimplemented. OBS control/auth flow and published Pages testing are explicitly deferred.
- Test/fix: first transport test failed because Node's method mock could not construct the fake WebSocket class. Replaced it with a scoped constructor stub restored after the test; test then passed.
- Browser offline audio stress check passed: 48-source cap, finite stereo samples, measured peak 0.39634 below 0.56 ceiling at maximum volume, silent tail. No audio file generated. Added `tests/audio.html` to rerun this check.
- Browser verified empty client ID rejection. Live OAuth/channel traffic not tested: no broadcaster session provided. No claim of OBS validation or subjective sound approval.
- Added scheduler regression coverage for full steps, lookahead and stalled-browser recovery; revocation test checks token disposal.
- Final slice validation: 8/8 Node tests passed; module syntax and diff checks passed. Local server returned 200 for app assets and rejected non-app paths. Final browser check started audio, queued/played bass from form, then stopped playback for handoff.
- Listening checkpoint reached. Milestone 1 implementation is ready; live Twitch acceptance and user's sound verdict remain pending. Do not proceed to milestone 2 yet.

## Scope revision — deterministic sets, recording and OBS authentication
- User changed requirements before further feature work. Updated AGENTS.md and README; no runtime changes in this revision. Listening checkpoint still applies.
- Deterministic foundation comes first: seeded noise and event-driven musical decisions; replace current Math.random noise and text/username-derived choices. Record initial settings, resolved decisions, controls, clock timing and stable event order. Engine/schema versions keep old sets interpretable. Cross-browser bit-identical PCM is not promised.
- Milestone 2: compact local JSON set log, anonymous player aliases by default, usernames only on opt-in, master MediaRecorder capture. Milestone 3: same-engine replay, local import and set links without Twitch login. No automatic uploads. Offline WAV is stretch.
- Corrected Hype Train plan: begin short riser then drop, stronger drop on level-up, breakdown on end. Supersedes original end/drop proposal.
- Re-read Twitch device-code and refresh documentation. Public-client device flow can obtain and rotate tokens without a secret; planned OBS source owns both tokens in memory. Normal browser only authorizes device code. Existing implicit flow remains unchanged for now and requires login again after expiry.
- Planned expiry handling: one refresh operation, rotated refresh token retained in memory, resubscribe if needed; on revocation/failure, discard credentials, keep local music running and request device authorization. OBS reload loses session; disable source shutdown/refresh on scene changes. Must verify in real OBS before claiming working integration.
- Schedule supersedes prior plan: code, Pages/OBS verification and documentation complete by Oct 31. Nov 1–2 for demo production, YouTube, description and Devpost. Final deadline Nov 2, 2 PM PT.
- Validation: documentation-only revision; inspected diff for consistency. Runtime tests not rerun because runtime code unchanged.

## Connection hardening — requested before further musical features
- Re-read https://dev.twitch.tv/docs/eventsub/handling-websocket-events/ and checked EventSub chat color/fragments reference.
- Clarified conflict between exactly one socket and Twitch's lossless reconnect instructions. User approved one steady connection with brief old/new overlap only during Twitch-directed handover.
- Fixed duplicate reconnect spawning, stale subscription completion, lost migration handling and temporary validation failures discarding valid tokens. Subscribe immediately with explicit 8-second abort/recovery deadline. Respect keepalive timeout; reconnect/resubscribe on loss; classify close/revocation reasons; retry temporary HTTP failures and rate limits. Bound deduplication storage.
- Validate startup/hourly, retry network failures after 30 seconds, clear credentials on invalidation/known expiry. No hard-coded real tokens, write scopes, chat sends or bot account. Device-flow automatic refresh remains a separate planned change; current implicit session ends at expiry while audio continues.
- Carry validated Twitch color to visual accents, username-hash fallback for empty/invalid color. Preserve readable text. Accept emotes only from emote fragments; malformed fragment collections cannot crash processing.
- Tests include immediate/duplicate welcome, 8-second subscription abort, stale async completion, keepalive loss, successful/failed/duplicate handover, close-code recovery, four simulated hours with hourly validation, transient validation failure, cancellation, rate limits, expiry and revocation reasons. Mocked time is not evidence of a real multi-hour Twitch/OBS session.
- Validation: 19/19 tests passed; JavaScript syntax and diff checks passed. Browser ran updated build, queued/played bass with username-derived color accent, then stopped playback. Real Twitch login, multi-hour network soak and OBS remain unverified. No musical synthesis changes in this slice.
