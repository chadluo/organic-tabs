export type Theme = "system" | "light" | "dark";
import type { SortMode } from "./sort";
import { StorageEntry, sessionBackend } from "./storage";

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
// Session storage: window ids are reused after a browser restart, so titles must not outlive the session.
const ntpTitleEntry = (windowId: number) => new StorageEntry<string>(`ntpTitle-${windowId}`, sessionBackend);

export async function loadSettings(): Promise<UserSettings> {
  return { ...defaultSettings, ...await settingsEntry.get() };
}

export function saveSettings(settings: UserSettings): Promise<void> {
  return settingsEntry.set(settings);
}

export async function loadNtpTitle(windowId: number): Promise<string> {
  return (await ntpTitleEntry(windowId).get()) ?? NTP_TITLE_DEFAULT;
}

export function saveNtpTitle(windowId: number, title: string): Promise<void> {
  return ntpTitleEntry(windowId).set(title);
}
