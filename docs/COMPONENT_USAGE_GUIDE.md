# Component usage guide

| Need | Use |
|---|---|
| Primary route heading | `WorkspaceHeader` / `PageHeader` |
| Compact state | `StatusIndicator` / `Badge` |
| Confirmation or form | Radix-backed `Dialog` |
| View mode | Radix-backed `Segmented` |
| Master/detail | `ClySplitPane` |
| Structured comparison | `ClyDataTable` |
| 100+ scan rows | `ClyVirtualList` |
| Terminal output | `ClyTerminal` |
| Unclear icon action | `ClyTooltip` |
| Compact action menu | `ClyMenu` |
| Relationship surface | React Flow with Cly nodes |

Do not import vendor primitives in feature screens when a Cly wrapper exists. Do not use `Panel` as a generic card around every section.
