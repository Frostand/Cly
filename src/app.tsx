import { ThemeProvider } from "@/components/theme-provider";
import { ClyAppShell } from "@/features/cly/components/app-shell";
import "@/features/cly/cly.css";
import "@/features/cly/redesign-research.css";

export const App = () => {
  useEffect(() => {
    document.querySelector(".boot-loading")?.remove();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      enableSystem
      storageKey="cly-theme"
    >
      <ClyAppShell />
    </ThemeProvider>
  );
};

import { useEffect } from "react";
