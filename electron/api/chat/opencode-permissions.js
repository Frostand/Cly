export const getOpenCodeServerConfig = (agentMode, codexPermissionMode) => {
  if (agentMode === "plan") {
    return {
      permission: {
        bash: "deny",
        edit: "deny",
        external_directory: "deny",
        glob: "allow",
        grep: "allow",
        list: "allow",
        lsp: "allow",
        question: "allow",
        read: "allow",
        skill: "deny",
        task: "deny",
        todowrite: "allow",
        webfetch: "deny",
        websearch: "deny",
      },
    };
  }

  return {
    permission: {
      // Never let a renderer-originated chat extend OpenCode's filesystem
      // authority beyond the main-process-resolved project directory.
      bash: "ask",
      doom_loop: "deny",
      edit: codexPermissionMode === "auto-accept-edits" ? "allow" : "deny",
      external_directory: "deny",
      question: "allow",
      skill: "ask",
      task: "ask",
      todowrite: "allow",
      webfetch: "ask",
      websearch: "ask",
    },
  };
};
