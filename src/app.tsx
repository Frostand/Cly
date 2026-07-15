import { ThemeProvider } from "@/components/theme-provider";
import { ClyAppShell } from "@/features/cly/components/app-shell";
import "@/features/cly/cly.css";

export const App = () => {
  useEffect(() => {
    document.querySelector(".boot-loading")?.remove();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem
      storageKey="cly-theme"
    >
      <ClyAppShell />
    </ThemeProvider>
  );
};

import { useEffect } from "react";
