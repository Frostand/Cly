// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  getBoundRendererId,
  getHostCommandApprovalOptions,
  getPrivilegedRendererId,
  getProviderHostActionApprovalOptions,
  getSessionBoundRenderer,
  getTerminalLaunchApprovalOptions,
  isTerminalSessionOwner,
  normalizeExternalHttpUrl,
  resolveTerminalLaunch,
} from "./privileged-ipc.js";

const createEvent = ({
  id = 1,
  role = "agent",
  url = "http://127.0.0.1:3210",
} = {}) => {
  const mainFrame = {};
  const sender = {
    getURL: () => url,
    id,
    isDestroyed: () => false,
    mainFrame,
  };
  return {
    event: { sender, senderFrame: mainFrame },
    windowBindings: new Map([[id, { role }]]),
  };
};

describe("privileged renderer IPC", () => {
  it("accepts only the registered top-level agent renderer", () => {
    const fixture = createEvent();
    expect(
      getPrivilegedRendererId(fixture.event, {
        allowedRoles: ["agent"],
        isRendererNavigation: (url: string) => url.endsWith(":3210"),
        windowBindings: fixture.windowBindings,
      }),
    ).toBe(1);

    expect(
      getPrivilegedRendererId(
        { ...fixture.event, senderFrame: {} },
        {
          allowedRoles: ["agent"],
          isRendererNavigation: () => true,
          windowBindings: fixture.windowBindings,
        },
      ),
    ).toBeNull();
    expect(
      getPrivilegedRendererId(createEvent({ role: "workspace" }).event, {
        allowedRoles: ["agent"],
        isRendererNavigation: () => true,
        windowBindings: createEvent({ role: "workspace" }).windowBindings,
      }),
    ).toBeNull();
  });

  it("can authenticate a bound preload before renderer navigation completes", () => {
    const fixture = createEvent({ url: "about:blank" });

    expect(
      getBoundRendererId(fixture.event, {
        allowedRoles: ["agent"],
        windowBindings: fixture.windowBindings,
      }),
    ).toBe(1);
    expect(
      getBoundRendererId(
        { ...fixture.event, senderFrame: {} },
        {
          allowedRoles: ["agent"],
          windowBindings: fixture.windowBindings,
        },
      ),
    ).toBeNull();
  });

  it("binds workspace IPC authority to its own session", () => {
    const fixture = createEvent({ role: "workspace" });
    fixture.windowBindings.set(1, {
      role: "workspace",
      sessionId: "session-1",
    });
    const options = {
      allowedRoles: ["agent", "workspace"],
      isRendererNavigation: () => true,
      windowBindings: fixture.windowBindings,
    };

    expect(
      getSessionBoundRenderer(fixture.event, {
        ...options,
        sessionId: "session-1",
      }),
    ).toMatchObject({ role: "workspace", sessionId: "session-1" });
    expect(
      getSessionBoundRenderer(fixture.event, {
        ...options,
        sessionId: "session-2",
      }),
    ).toBeNull();
  });

  it("normalizes only credential-free HTTP(S) external URLs", () => {
    expect(normalizeExternalHttpUrl("https://example.com/docs?q=1")).toBe(
      "https://example.com/docs?q=1",
    );
    expect(
      normalizeExternalHttpUrl("https://user:secret@example.com/"),
    ).toBeNull();
    expect(normalizeExternalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(
      normalizeExternalHttpUrl("https://example.com/\nmalicious"),
    ).toBeNull();
    expect(
      normalizeExternalHttpUrl("https://example.com\u202e.evil.test"),
    ).toBeNull();
  });

  it("derives terminal authority from the persisted project", () => {
    const state = {
      projects: [
        {
          id: "project-1",
          name: "Cly",
          path: "/trusted/cly",
          runCommand: "pnpm dev",
        },
      ],
      settings: { shellPath: "/bin/zsh" },
    };

    expect(
      resolveTerminalLaunch(
        {
          command: "rm -rf /",
          cwd: "/",
          projectId: "project-1",
          purpose: "run-project",
          sessionId: "__browser_terminal__:project-1",
          shellPath: "/tmp/evil-shell",
        },
        state,
      ),
    ).toEqual({
      command: "pnpm dev",
      cwd: "/trusted/cly",
      projectId: "project-1",
      purpose: "run-project",
      sessionId: "__browser_terminal__:project-1",
      shellPath: "/bin/zsh",
    });

    expect(() =>
      resolveTerminalLaunch(
        {
          projectId: "project-1",
          sessionId: "__project_terminal__:project-2:attacker",
        },
        state,
      ),
    ).toThrow("Invalid project terminal session");
    expect(() =>
      resolveTerminalLaunch(
        {
          projectId: "project-1",
          purpose: "interactive",
          sessionId: "__project_terminal__:project-1:attacker-chosen",
        },
        state,
      ),
    ).toThrow("Invalid project terminal session");
    expect(() =>
      resolveTerminalLaunch(
        {
          projectId: "project-1",
          purpose: "arbitrary-command",
          sessionId: "__browser_terminal__:project-1",
        },
        state,
      ),
    ).toThrow("Invalid project terminal session");
  });

  it("requires a native confirmation that shows the exact command and root", () => {
    const options = getTerminalLaunchApprovalOptions({
      command: "pnpm test",
      cwd: "/trusted/cly",
      purpose: "run-project",
    });

    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(0);
    expect(options.detail).toContain("pnpm test");
    expect(options.detail).toContain("/trusted/cly");
  });

  it("defaults host-command confirmation to cancel and exposes its authority", () => {
    const options = getHostCommandApprovalOptions({
      command: "pnpm test\n\u202erm -rf /",
      root: "/trusted/cly-worktree",
    });

    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(0);
    expect(options.detail).toContain("pnpm test\\u{000a}\\u{202e}rm -rf /");
    expect(options.detail).not.toContain("\u202e");
    expect(options.detail).toContain("/trusted/cly-worktree");
    expect(options.detail).toContain("outside the project");
  });

  it("binds provider host approval to a visible action and hashes truncation", () => {
    const options = getProviderHostActionApprovalOptions({
      action: `run tests\n${"x".repeat(5_000)}`,
      provider: "OpenCode",
      root: "/trusted/cly-worktree",
    });

    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(0);
    expect(options.detail).toContain("OpenCode");
    expect(options.detail).toContain("/trusted/cly-worktree");
    expect(options.detail).toContain("\\u{000a}");
    expect(options.detail).toMatch(/SHA-256: [a-f0-9]{64}/);
  });

  it("binds terminal follow-up messages to the creating renderer", () => {
    const owners = new Map([["terminal-1", 1]]);
    expect(isTerminalSessionOwner(owners, 1, "terminal-1")).toBe(true);
    expect(isTerminalSessionOwner(owners, 2, "terminal-1")).toBe(false);
  });
});
