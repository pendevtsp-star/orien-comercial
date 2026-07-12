export interface UserPreferences {
  theme: "orien" | "safira" | "esmeralda" | "grafite" | "rubi" | "solaris";
  colorMode: "light" | "dark" | "system";
  sidebarMode: "expanded" | "compact" | "collapsed";
  density: "comfortable" | "compact";
  startPage: string;
  dateFormat: "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  reduceMotion: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  favoriteRoutes: string[];
  dashboardWidgets: string[];
}
export const defaultPreferences: UserPreferences = {
  theme: "orien",
  colorMode: "system",
  sidebarMode: "expanded",
  density: "comfortable",
  startPage: "/dashboard",
  dateFormat: "dd/MM/yyyy",
  reduceMotion: false,
  notifyInApp: true,
  notifyEmail: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  favoriteRoutes: [],
  dashboardWidgets: ["executive", "financial", "indicators", "performance", "period", "goals", "role-focus", "health"],
};
export function applyPreferences(preferences: UserPreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark =
    preferences.colorMode === "dark" ||
    (preferences.colorMode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = preferences.theme;
  root.dataset.colorMode = dark ? "dark" : "light";
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
  root.dataset.dashboardWidgets = preferences.dashboardWidgets.join(" ");
  window.localStorage.setItem("orien.preferences", JSON.stringify(preferences));
}
