# Chat Rave working rules

- Keep prose concise. Reuse native APIs; smallest correct implementation.
- All project code is new, written in this chat. No build step or paid APIs.
- Plain HTML, JavaScript modules, Web Audio. English only. MIT license.
- Sound first. Handle listening feedback one change at a time.
- Ship no audio files. Synthesize every sound, including noise. Optional local-folder sample loading only after milestone 4, if time remains.
- Never open, print, log, or request secret contents. Ignore `.env` files. Runtime OAuth tokens stay in memory, never in logs or persistent storage.
- Validate external input. Bound voices, chat rate, notes per bar and output level. Preserve panic mute.
- Every small step: run, test pure logic, update BUILD_LOG.md with failures and fixes, commit.
- Milestones: 1 chat/drums/bass; 2 energy/visuals; 3 Twitch musical events; 4 documentation/Pages/demo.
- Stop after milestone 1 for listening. Keep all work in this chat.
- Deadline: November 2, 2026, 2:00 PM America/Los_Angeles.
