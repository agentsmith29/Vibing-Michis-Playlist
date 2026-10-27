export type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "michi-theme";

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "dark" || value === "light" || value === "system") return value;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

export function applyTheme(preference: ThemePreference = getThemePreference()) {
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = preference === "system" ? (prefersLight ? "light" : "dark") : preference;
  document.documentElement.setAttribute("data-bs-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121212" : "#ffffff");
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* storage unavailable */
  }
  applyTheme(preference);
}
