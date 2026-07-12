import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export const clyPalettes = [
  "purple",
  "blue",
  "green",
  "sunset",
  "mono",
] as const;
export type ClyPalette = (typeof clyPalettes)[number];

const paletteLabels: Record<ClyPalette, string> = {
  purple: "Cly purple",
  blue: "Research blue",
  green: "Discovery green",
  sunset: "Sunset",
  mono: "Monochrome",
};

function readPalette(): ClyPalette {
  if (typeof window === "undefined") return "purple";
  const stored = window.localStorage.getItem("cly-palette");
  return clyPalettes.includes(stored as ClyPalette)
    ? (stored as ClyPalette)
    : "purple";
}

export function useClyPalette() {
  const [palette, setPaletteState] = useState<ClyPalette>(readPalette);
  const setPalette = (next: ClyPalette) => {
    setPaletteState(next);
    window.localStorage.setItem("cly-palette", next);
    document.documentElement.dataset.clyPalette = next;
  };
  useEffect(() => {
    document.documentElement.dataset.clyPalette = palette;
  }, [palette]);
  return { palette, setPalette };
}

export function ClyLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="cly-brand-lockup" data-compact={compact}>
      <span className="cly-sr-only">Cly</span>
      <span className="cly-brand-mark" aria-hidden="true" />
    </span>
  );
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { palette, setPalette } = useClyPalette();
  const isDark = resolvedTheme === "dark";
  const activeTheme = theme === "system" ? "system" : isDark ? "dark" : "light";
  const label = `${paletteLabels[palette]}, ${activeTheme}`;

  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>
        <button
          className="cly-theme-trigger cly-sidebar-item"
          type="button"
          aria-label={`Appearance: ${label}`}
          title={compact ? `Appearance: ${label}` : undefined}
        >
          {isDark ? <Moon size={15} /> : <Sun size={15} />}
          <span className="cly-sidebar-item-label">
            {paletteLabels[palette]}
          </span>
          <span className="cly-theme-swatch" data-palette={palette} />
          <ChevronDown className="cly-theme-chevron" size={12} />
        </button>
      </RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className="cly-radix-menu cly-theme-menu"
          aria-label="Choose Cly appearance"
          sideOffset={5}
          align="start"
        >
          <RadixDropdown.Label className="cly-theme-menu-label">
            Appearance
          </RadixDropdown.Label>
          <RadixDropdown.RadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
          >
            {(["light", "dark", "system"] as const).map((mode) => (
              <RadixDropdown.RadioItem
                className="cly-radix-menu-item cly-theme-menu-item"
                value={mode}
                key={mode}
              >
                <RadixDropdown.ItemIndicator className="cly-theme-menu-check">
                  <Check size={12} />
                </RadixDropdown.ItemIndicator>
                <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
              </RadixDropdown.RadioItem>
            ))}
          </RadixDropdown.RadioGroup>
          <RadixDropdown.Separator className="cly-theme-menu-separator" />
          <RadixDropdown.Label className="cly-theme-menu-label">
            Accent color
          </RadixDropdown.Label>
          <RadixDropdown.RadioGroup
            value={palette}
            onValueChange={(value) => setPalette(value as ClyPalette)}
          >
            {clyPalettes.map((option) => (
              <RadixDropdown.RadioItem
                className="cly-radix-menu-item cly-theme-menu-item"
                value={option}
                key={option}
              >
                <RadixDropdown.ItemIndicator className="cly-theme-menu-check">
                  <Check size={12} />
                </RadixDropdown.ItemIndicator>
                <span
                  className="cly-theme-option-swatch"
                  data-palette={option}
                />
                <span>{paletteLabels[option]}</span>
              </RadixDropdown.RadioItem>
            ))}
          </RadixDropdown.RadioGroup>
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
