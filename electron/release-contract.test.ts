// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("V1 production release contract", () => {
  it("allows production publication only from the exact package-version tag", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain('tags: ["v*.*.*"]');
    expect(workflow).not.toContain("workflow_dispatch");
    expect(workflow).toContain(
      'node scripts/validate-release-tag.mjs "$GITHUB_REF_NAME"',
    );
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    );
    expect(read("scripts/validate-release-tag.mjs")).toContain(
      "tag !== expectedTag",
    );
  });

  it("gates publication on tagged acceptance, security, and license checks", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("environment: production-release");
    expect(workflow).toContain("tests/e2e/onboarding.spec.ts");
    expect(workflow).toContain("tests/e2e/production-evidence-loop.spec.ts");
    expect(workflow).toContain("tests/e2e/critical-accessibility.spec.ts");
    expect(workflow).not.toContain("tests/e2e/agent-sessions.spec.ts");
    expect(workflow).toContain(
      "Authenticated Claude production provider smoke",
    );
    expect(workflow).toContain('CLY_RELEASE_PROVIDER_SMOKE: "1"');
    expect(workflow).toContain("tests/e2e/production-provider-smoke.spec.ts");
    expect(workflow).toContain(
      "needs: [acceptance, provider-smoke, macos, windows, linux]",
    );
    const providerSmokeBoundary = read("electron/release-provider-smoke.js");
    expect(providerSmokeBoundary).toContain('environment.CLY_E2E === "1"');
    expect(providerSmokeBoundary).toContain(
      'environment.CLY_RELEASE_PROVIDER_SMOKE === "1"',
    );
    expect(providerSmokeBoundary).toContain("isPackaged !== true");
    expect(workflow).toContain("pnpm companion-contract:check");
    expect(workflow).toContain("pnpm capabilities:check");
    expect(workflow).toContain("pnpm licenses:check");
    expect(workflow).toContain("pnpm audit --audit-level high");
    expect(workflow).toContain("pnpm audit --prod --audit-level high");
    expect(workflow).toContain("gitleaks/gitleaks-action");
  });

  it("requires signed/notarized artifacts and packaged executable smoke checks", () => {
    const workflow = read(".github/workflows/release.yml");
    const packageJson = JSON.parse(read("package.json"));
    expect(packageJson.build.afterSign).toBe("scripts/notarize-after-sign.cjs");
    expect(workflow).toContain('CLY_REQUIRE_NOTARIZATION: "1"');
    expect(workflow).toContain("codesign --verify --deep --strict");
    expect(workflow).toContain("spctl --assess --type execute");
    expect(workflow).toContain("Get-AuthenticodeSignature");
    expect(workflow.match(/scripts\/smoke-packaged-app\.mjs/g)).toHaveLength(3);
    expect(workflow.match(/actions\/setup-python@v5/g)).toHaveLength(4);
    expect(workflow.match(/CLY_PACKAGED_APP_EXECUTABLE=/g)).toHaveLength(2);
    expect(workflow).toContain(
      "$env:CLY_PACKAGED_APP_EXECUTABLE = $app.FullName",
    );
    expect(
      workflow.match(/tests\/e2e\/production-evidence-loop\.spec\.ts/g),
    ).toHaveLength(4);
    expect(read("tests/e2e/production-evidence-loop.spec.ts")).toContain(
      "executablePath: path.resolve(packagedExecutable)",
    );
  });

  it("verifies immutable public files before promoting version-scoped updater metadata", () => {
    const workflow = read(".github/workflows/release.yml");
    const rewriteScript = read("scripts/rewrite-update-metadata-urls.mjs");
    const verifier = read("scripts/verify-release-artifacts.mjs");
    expect(rewriteScript).toContain(
      "/versions/$" + "{encodeURIComponent(releaseVersion)}",
    );
    expect(verifier).toContain("invalid SHA-512");
    expect(verifier).toContain("invalid byte size");
    expect(workflow).toContain("scripts/verify-release-artifacts.mjs");
    expect(workflow).toContain("scripts/verify-public-release.mjs");
    expect(verifier).toContain("release-manifest.json");
    expect(workflow).toContain("SHA256SUMS");

    const immutableUpload = workflow.indexOf(
      "Upload immutable versioned release files",
    );
    const immutableVerify = workflow.indexOf(
      "Re-download and verify every immutable public file",
    );
    const githubRelease = workflow.indexOf(
      "Create the GitHub release from the verified bundle",
    );
    const promotion = workflow.indexOf(
      "Promote verified updater metadata with atomic object replacement",
    );
    const promotedVerify = workflow.indexOf(
      "Verify every promoted metadata key through the public feed",
    );
    expect(immutableUpload).toBeGreaterThan(-1);
    expect(immutableVerify).toBeGreaterThan(immutableUpload);
    expect(githubRelease).toBeGreaterThan(immutableVerify);
    expect(promotion).toBeGreaterThan(githubRelease);
    expect(promotedVerify).toBeGreaterThan(promotion);
  });

  it("documents protected ownership, clean-install acceptance, and recoverable rollback", () => {
    const operations = read("docs/release-operations.md");
    for (const heading of [
      "## Ownership and environments",
      "## Required GitHub environment secrets",
      "## One-time R2 setup",
      "## Release procedure",
      "## Artifact acceptance checklist",
      "## Rollback procedure",
      "## Incident evidence",
    ]) {
      expect(operations).toContain(heading);
    }
    expect(operations).toMatch(/Complete guided\s+setup/);
    expect(operations).toContain("pre-migration SQLite backup");
    expect(operations).toContain("Diagnostics must exclude source bodies");
    expect(operations).toMatch(/does not prove DMG mounting, NSIS\s+install/);
    expect(operations).toMatch(
      /same full\s+fresh-profile claim-to-computation loop/,
    );
  });
});
