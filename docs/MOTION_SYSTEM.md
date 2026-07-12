# Motion system

Motion explains state and spatial relationships. It never delays interaction or acts as ambient decoration.

| Token | Duration | Use |
|---|---:|---|
| immediate | 100ms | press, focus, selection |
| fast | 120ms | toggle and tab feedback |
| small | 180ms | menu, disclosure, list insertion |
| panel | 220ms | inspector or workbench change |
| structural | 280ms | route/mode transition, graph focus |

Easing tokens in `design-system/motion.ts` cover enter, exit, move, and rare emphasis. Prefer opacity and transform; width is used only for bounded progress and budget tracks.

`ClyMotionProvider` uses Motion's `reducedMotion="user"`. When the system requests reduced motion, route changes use a short fade, sparklines render without path drawing, and CSS disables transitions and animation. State remains understandable from text and static geometry.

Allowed loops are limited to a subtle active-work indicator. Routing paths, charts, gradients, cards, and backgrounds must not loop. Entrance animation runs only when state is introduced, not on every data re-render.
