# Contributing to Cly

Thanks for helping build a more inspectable research workflow. Cly welcomes
bug reports, workflow proposals, documentation improvements, tests, and code.

## Product principles

- Keep the scientific method visible from question through review.
- Preserve evidence, uncertainty, provenance, and failures.
- Prefer local-first behavior and explicit approval before external transfer.
- Keep routes dense and continuous; use rows, tables, timelines, graphs, and
  split workspaces instead of generic card grids.
- Never make an unsupported research claim look complete.

## Local setup

Requirements: Node.js 22.12 or newer and pnpm 11.12.

```bash
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

## Before opening a pull request

Run the release checks that cover your change:

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:e2e
pnpm capabilities:check
pnpm licenses:check
pnpm package:dir
```

For interface changes, include the flow you tested, populated and empty-state
behavior, keyboard behavior, and screenshots at the affected desktop sizes.

## Pull requests

Keep each pull request focused. Explain the user problem, the scientific or
product constraint, the behavior that changed, and the evidence that verifies
it. Link an issue when one exists. New features should include tests and update
the capability inventory when they change the release boundary.

## License

By contributing, you agree that your contributions will be licensed under the
Apache License 2.0, the same license as Cly's original source code. Third-party
material must retain its applicable license and attribution.
