export type Theme = "system" | "light" | "dark";
import type { SortMode } from "./sort";
import { StorageEntry } from "./storage";

export interface UserSettings {
  theme: Theme;
  bookmarksAndListsColumns: number;
  tabColumns: number;
  defaultSortMode: SortMode;
  newTabEnabled: boolean;
  tabSortEnabled: boolean;
  tabShiftEnabled: boolean;
}

export const SETTINGS_KEY = "userSettings";

export const defaultSettings: UserSettings = {
  theme: "system",
  bookmarksAndListsColumns: 1,
  tabColumns: 1,
  defaultSortMode: "website",
  newTabEnabled: true,
  tabSortEnabled: true,
  tabShiftEnabled: true,
};

const NTP_TITLE_DEFAULT = "Organic Tabs";

const settingsEntry = new StorageEntry<UserSettings>(SETTINGS_KEY);
const ntpTitleEntry = (tabId: number) => new StorageEntry<string>(`ntpTitle-${tabId}`);

export async function loadSettings(): Promise<UserSettings> {
  return { ...defaultSettings, ...await settingsEntry.get() };
}

export function saveSettings(settings: UserSettings): Promise<void> {
  return settingsEntry.set(settings);
}

export async function loadNtpTitle(tabId: number): Promise<string> {
  return (await ntpTitleEntry(tabId).get()) ?? NTP_TITLE_DEFAULT;
}

export function saveNtpTitle(tabId: number, title: string): Promise<void> {
  return ntpTitleEntry(tabId).set(title);
}
