# Feature Specs

Each file is tied to a feature branch and describes what to build, how to implement it, acceptance criteria, and expected results.

## 📦 Next Product Slice

| # | Branch | Spec |
|---|---|---|
| 1 | `feature/reciprocal-rank-fusion` | [Spec](reciprocal-rank-fusion.md) |
| 2 | `feature/compact-paper-table` | [Spec](compact-paper-table.md) |
| 3 | `feature/paper-detail-panel` | [Spec](paper-detail-panel.md) |
| 4 | `feature/local-folders` | [Spec](local-folders.md) |
| 5 | `feature/folder-downloads` | [Spec](folder-downloads.md) |
| 6 | `feature/relationship-map` | [Spec](relationship-map.md) |
| 7 | `feature/pdf-parsing` | [Spec](pdf-parsing.md) |

## 🔮 Later Milestones

| # | Branch | Spec |
|---|---|---|
| 8 | `feature/semantic-scholar-source` | [Spec](semantic-scholar-source.md) |
| 9 | `feature/embedding-ranking` | [Spec](embedding-ranking.md) |
| 10 | `feature/reading-map-ui` | [Spec](reading-map-ui.md) |
| 11 | `feature/topic-memory` | [Spec](topic-memory.md) |
| 12 | `feature/built-in-local-model` | [Spec](built-in-local-model.md) |
| 13 | `feature/full-pdf-reading` | [Spec](full-pdf-reading.md) |
| 14 | `feature/polish-reliability` | [Spec](polish-reliability.md) |
| 15 | `feature/sharing` | [Spec](sharing.md) |

## ✨ New Additions

| # | Branch | Spec |
|---|---|---|
| 16 | `feature/cloud-ai-providers` | [Spec](cloud-ai-providers.md) |
| 17 | `feature/oauth-login` | [Spec](oauth-login.md) |

## Execution Order

```
Wave 1 (infrastructure):  cloud-ai-providers
Wave 2 (core UX):         compact-paper-table → paper-detail-panel
Wave 3 (organization):    local-folders → folder-downloads
Wave 4 (intelligence):    reciprocal-rank-fusion ∥ embedding-ranking ∥ semantic-scholar-source
Wave 5 (advanced UX):     relationship-map → reading-map-ui ∥ topic-memory ∥ built-in-local-model
Wave 6 (social):          oauth-login → sharing
Wave 7 (depth + polish):  pdf-parsing → full-pdf-reading ∥ polish-reliability
```

`∥` = can be done in parallel. `→` = must be sequential.
