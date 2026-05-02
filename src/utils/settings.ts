export type Theme = "system" | "light" | "dark";
export type SortMode = "title" | "website" | "lastAccessed";
export type Direction = "up" | "down" | "left" | "right";

export interface UserSettings {
  theme: Theme;
  bookmarkColumns: number;
  tabColumns: number;
  defaultSortMode: SortMode;
  newTabEnabled: boolean;
  tabSortEnabled: boolean;
  tabShiftEnabled: boolean;
}

export const SETTINGS_KEY = "userSettings";

export const defaultSettings: UserSettings = {
  theme: "system",
  bookmarkColumns: 1,
  tabColumns: 1,
  defaultSortMode: "website",
  newTabEnabled: true,
  tabSortEnabled: true,
  tabShiftEnabled: true,
};

export async function loadSettings(): Promise<UserSettings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return {
    ...defaultSettings,
    ...(data[SETTINGS_KEY] as Partial<UserSettings> | undefined),
  };
}

export function saveSettings(settings: UserSettings): Promise<void> {
  return browser.storage.local.set({ [SETTINGS_KEY]: settings });
}
