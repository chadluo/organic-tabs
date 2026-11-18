export type Theme = "system" | "light" | "dark";
import { APEX, OTHERS, type DomainRules, type HostRules, type SortMode } from "./sort";
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

const sortRulesEntry = new StorageEntry<HostRules>("sortRules");

export async function loadSortRules(): Promise<HostRules> {
  return (await sortRulesEntry.get()) ?? {};
}

const subdomainRulesEntry = new StorageEntry<DomainRules>("subdomainRules");

export async function loadSubdomainRules(): Promise<DomainRules> {
  return (await subdomainRulesEntry.get()) ?? {};
}

/** Sets `key` to `list` in the stored table, or removes `key` when `list` is the default order. */
async function saveRuleList(entry: StorageEntry<HostRules>, key: string, list: string[], isDefault: boolean) {
  const rules = { ...(await entry.get()) };
  if (isDefault) delete rules[key];
  else rules[key] = list;
  await entry.set(rules);
}

/** Saves one host's rules. A list with only the `OTHERS` marker equals no rules, so the host entry is removed. */
export function saveHostRules(host: string, list: string[]): Promise<void> {
  return saveRuleList(sortRulesEntry, host, list, list.every((rule) => rule === OTHERS));
}

/** Saves one domain's subdomain order. `[APEX, OTHERS]` is the unsorted order, so the domain entry is removed. */
export function saveDomainRules(domain: string, list: string[]): Promise<void> {
  return saveRuleList(subdomainRulesEntry, domain, list, list.join("\n") === `${APEX}\n${OTHERS}`);
}
