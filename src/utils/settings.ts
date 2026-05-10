export type Theme = "system" | "light" | "dark";
import type { SortMode } from "./sort";

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
const ntpTitleKey = (tabId: number) => `ntpTitle-${tabId}`;

export async function loadNtpTitle(tabId: number): Promise<string> {
  const data = await browser.storage.local.get(ntpTitleKey(tabId));
  return (data[ntpTitleKey(tabId)] as string | undefined) ?? NTP_TITLE_DEFAULT;
}

export function saveNtpTitle(tabId: number, title: string): Promise<void> {
  return browser.storage.local.set({ [ntpTitleKey(tabId)]: title });
}

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
