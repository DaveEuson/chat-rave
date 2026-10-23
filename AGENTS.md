# Chat Rave working rules

- Keep prose concise. Reuse native APIs; smallest correct implementation.
- All project code is new, written in this chat. No build step or paid APIs.
- Plain HTML, JavaScript modules, Web Audio. English only. MIT license.
- Sound first. Handle listening feedback one change at a time.
- Determinism: every musical decision derives from one session seed plus ordered, timestamped events and anonymous player IDs. No Math.random in music. Seed synthesized noise too. Record tempo/key/preset/mix/panic changes and resolved note/instrument/pan decisions. Version the set format and engine. Test identical event streams for identical decisions.
- Milestone 2 records compact local JSON sets (bar/step timing, event type, instrument, note, anonymous player ID). Real usernames only with explicit streamer opt-in; omit raw chat and Twitch IDs by default. Record master audio through MediaRecorder. Never upload automatically.
- Milestone 3 adds browser replay with the same engine/visuals, no Twitch login, local file import and shareable set links. Offline WAV rendering is stretch scope.
- Hype Train: begin = short riser then drop; each level-up = bigger drop; end = breakdown. Never drop on end. Deduplicate and handle out-of-order notifications.
- OBS auth plan: public-client device-code flow initiated by overlay; access and rotating refresh tokens in source memory only. One refresh at a time; failed/revoked refresh requires reauthorization while local music continues. Refresh/reload loses credentials.
- Ship no audio files. Synthesize every sound, including noise. Optional local-folder sample loading only after milestone 4, if time remains.
- Never open, print, log, or request secret contents. Ignore `.env` files. Runtime OAuth tokens stay in memory, never in logs or persistent storage.
- Validate external input. Bound voices, chat rate, notes per bar and output level. Preserve panic mute.
- Every small step: run, test pure logic, update BUILD_LOG.md with failures and fixes, commit.
- Milestones: 1 chat/drums/bass; deterministic foundation before new features; 2 energy/visuals/set log/audio recording/OBS auth; 3 Twitch musical events/replay; 4 documentation/Pages/code freeze.
- Stop after milestone 1 for listening. Keep all work in this chat.
- Deadline: November 2, 2026, 2:00 PM America/Los_Angeles.
- All code feature-complete by October 31. November 1–2 reserved for demo video, YouTube upload, description and Devpost form.
