# Dream IDE — Vendor Code

This directory contains the Dream IDE coding workspace (editor, terminal, Git,
chat, file explorer, settings, UI primitives). It is **inherited infrastructure**,
not Cly product code.

## Cly's relationship to this code

- Cly uses Dream for the **coding workspace layer** (Layer 3 in the architecture).
- The Cly research core (`src/features/cly/`) does **not** depend on Dream internals.
- Dream is a **replaceable implementation component** — these files can be swapped
  out for another editor or supplemented with external IDE integrations without
  affecting the research platform.

## Modification policy

- Do **not** add Cly domain logic here. Research code belongs in `src/features/cly/`.
- Changes to these files should be limited to:
  - Renderer composition (what gets mounted as the main view)
  - Menu commands (exposing research actions to the desktop shell)
  - IPC bridge (connecting the coding workspace to the research core)
- When in doubt, add an adapter in `src/features/cly/services/` instead of
  modifying Dream internals.

## Upstream

These files originated from [Dream IDE](https://github.com/dreamide/dream).
They remain covered by Dream IDE's MIT license, preserved at
[`licenses/DREAM_IDE-MIT.txt`](../../../licenses/DREAM_IDE-MIT.txt). That
third-party license does not apply to Cly's original source code.
See `docs/DREAM_UI_AUDIT.md` for the full inventory of what was retained,
replaced, or deferred.
