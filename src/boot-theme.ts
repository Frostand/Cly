const THEME_KEY = "dream-theme";
const UI_KEY = "dream-ui-preferences";
const root = document.documentElement;

try {
  const initialPreferences = window.dream?.initialThemePreferences;
  const storedTheme =
    initialPreferences?.theme ?? localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme =
    storedTheme === "light"
      ? "light"
      : storedTheme === "system"
        ? prefersDark
          ? "dark"
          : "light"
        : "dark";

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.toggle("light", resolvedTheme === "light");
  root.style.colorScheme = resolvedTheme;

  const rawUiPreferences = initialPreferences
    ? null
    : localStorage.getItem(UI_KEY);
  const parsedUiPreferences = rawUiPreferences
    ? JSON.parse(rawUiPreferences)
    : null;
  const baseColor =
    initialPreferences?.baseColor ?? parsedUiPreferences?.baseColor ?? "zinc";
  const accentColor =
    initialPreferences?.accentColor ??
    parsedUiPreferences?.accentColor ??
    "green";

  if (baseColor && baseColor !== "neutral") {
    root.setAttribute("data-base-color", baseColor);
  } else {
    root.removeAttribute("data-base-color");
  }

  root.setAttribute("data-accent-color", accentColor);
} catch {
  root.classList.add("dark");
  root.classList.remove("light");
  root.style.colorScheme = "dark";
  root.setAttribute("data-base-color", "zinc");
  root.setAttribute("data-accent-color", "green");
}
