# Research Core Delivery Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an enforceable, documented pull-request, security, dependency, license, and release baseline for Cly's research core.

**Architecture:** GitHub Actions provide narrowly scoped CI and security gates, while a repository-owned Node script enforces the production dependency license policy. A delivery guide records the GitHub settings that cannot be committed, maps GitHub work to Linear states, and assigns release responsibilities.

**Tech Stack:** GitHub Actions, pnpm 11, Node.js 22, TypeScript, Vitest, CodeQL

## Global Constraints

- Pull requests run typecheck and research-domain tests.
- Main-branch protections and review expectations are documented.
- Security checks match the local-service and integration threat model.
- The delivery workflow is linked from the Cly documentation.
- Electron packaging, IDE smoke tests, and upstream synchronization are excluded.

---

### Task 1: Focused research-core CI

**Files:**
- Create: `.github/workflows/research-core-ci.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing `typecheck` script and `src/lib/cly/**/*.test.ts` test boundary.
- Produces: stable `typecheck` and `research-domain-tests` checks for branch protection.

- [ ] **Step 1: Add a research-domain test script**

Add `"test:research": "vitest run src/lib/cly"` to `package.json`.

- [ ] **Step 2: Add the pull-request workflow**

Create a workflow triggered for pull requests and pushes to `main`, use Node 22 and pnpm 11 with a frozen install, and run typecheck and research-domain tests as separately named jobs.

- [ ] **Step 3: Verify the local equivalents**

Run `corepack pnpm typecheck` and `corepack pnpm test:research`.
Expected: both commands exit successfully.

### Task 2: Dependency, license, and code security gates

**Files:**
- Create: `.github/workflows/security.yml`
- Create: `.github/dependabot.yml`
- Create: `scripts/check-production-licenses.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `pnpm-lock.yaml` and the installed production dependency graph.
- Produces: `security / dependency-review`, `security / production-licenses`, and CodeQL checks plus weekly dependency update pull requests.

- [ ] **Step 1: Implement the production-license policy**

Parse `pnpm licenses list --prod --json`, allow the repository's permissive license set, explicitly document reviewed exceptions for Sharp's libvips binary and Anthropic SDK packages, and fail on every new or unreviewed license/package combination.

- [ ] **Step 2: Expose and run the license check**

Add `"licenses:check": "node scripts/check-production-licenses.mjs"` to `package.json` and run `corepack pnpm licenses:check`.
Expected: the current production graph passes and prints the number of reviewed packages.

- [ ] **Step 3: Add GitHub security workflows**

Run dependency review on pull requests, license checks on pull requests and `main`, and CodeQL on pull requests, `main`, and a weekly schedule. Grant each job only its required permissions.

- [ ] **Step 4: Configure dependency updates**

Configure weekly grouped pnpm and GitHub Actions Dependabot pull requests with conservative open-PR limits.

### Task 3: Governance and delivery documentation

**Files:**
- Create: `docs/DELIVERY_WORKFLOW.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: the stable workflow job names created by Tasks 1 and 2.
- Produces: the canonical branch-protection, review, Linear-state, threat-model, and release-ownership guide linked from the documentation index.

- [ ] **Step 1: Document enforcement and state transitions**

Document required `main` rules, one approving review, stale-review dismissal, CODEOWNERS-aware review when configured, conversation resolution, no force pushes/deletions, Linear Backlog/Todo/In Progress/In Review/Done/Canceled transitions, and release role ownership.

- [ ] **Step 2: Document the threat-model coverage**

Map dependency review, license checking, CodeQL, secret scanning/push protection, human approval, input validation, and least-privilege workflow permissions to local-service and integration risks.

- [ ] **Step 3: Link and align repository guidance**

Link the delivery guide from `README.md`, add the automated security controls to `SECURITY.md`, and update the pull-request checklist to name the focused research test and license commands.

- [ ] **Step 4: Review the complete change**

Run `git diff --check`, parse all workflow YAML files, and run `corepack pnpm typecheck`, `corepack pnpm test:research`, and `corepack pnpm licenses:check`.
Expected: no whitespace/YAML errors and all repository checks pass.
