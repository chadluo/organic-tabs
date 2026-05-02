import { useEffect, useState } from "react";
import "./App.css";

type SortMode = "title" | "website" | "lastAccessed";
type Theme = "system" | "light" | "dark";
type Direction = "up" | "down" | "left" | "right";

const SETTINGS_KEY = "userSettings";

interface UserSettings {
  theme: Theme;
  bookmarkColumns: number;
  tabColumns: number;
  defaultSortMode: SortMode;
  newTabEnabled: boolean;
  tabSortEnabled: boolean;
  tabShiftEnabled: boolean;
}

const defaultSettings: UserSettings = {
  theme: "system",
  bookmarkColumns: 1,
  tabColumns: 1,
  defaultSortMode: "website",
  newTabEnabled: true,
  tabSortEnabled: true,
  tabShiftEnabled: true,
};

async function loadSettings(): Promise<UserSettings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return {
    ...defaultSettings,
    ...(data[SETTINGS_KEY] as Partial<UserSettings> | undefined),
  };
}

async function saveSettings(settings: UserSettings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function sendBackgroundAction(message: Record<string, unknown>) {
  const response = await browser.runtime.sendMessage(message);
  if (!response?.success) {
    throw new Error(response?.error ?? "Background action failed.");
  }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [sortStatus, setSortStatus] = useState("");
  const [shiftStatus, setShiftStatus] = useState("");
  const [sortShortcut, setSortShortcut] = useState("Alt+Shift+S");

  useEffect(() => {
    void (async () => {
      const s = await loadSettings();
      setSettings(s);
      const commands = await browser.commands.getAll();
      const sortCmd = commands.find((c) => c.name === "sort-tabs");
      if (sortCmd?.shortcut) setSortShortcut(sortCmd.shortcut);
    })();
  }, []);

  async function updateSettings(patch: Partial<UserSettings>) {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await saveSettings(updated);
  }

  async function runSort(mode: SortMode) {
    try {
      setSortStatus(`Sorting by ${toLabel(mode)}…`);
      await sendBackgroundAction({ action: actionToMessage(mode) });
      setSortStatus(`Sorted by ${toLabel(mode)}.`);
    } catch {
      setSortStatus("Error: failed to sort tabs.");
    }
  }

  async function moveTab(direction: Direction) {
    try {
      setShiftStatus(`Moving tab ${direction}…`);
      await sendBackgroundAction({ action: "moveTabDirection", direction });
      setShiftStatus(`Moved tab ${direction}.`);
    } catch {
      setShiftStatus("Error: failed to move tab.");
    }
  }

  return (
    <div className="popup-root">
      <h1>Organic Tabs</h1>

      <section className="section">
        <div className="section-header">
          <h2>New Tab</h2>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.newTabEnabled}
              onChange={(e) =>
                void updateSettings({ newTabEnabled: e.target.checked })
              }
            />
            Enabled
          </label>
        </div>
        {settings.newTabEnabled && (
          <div className="sub-settings">
            <div className="setting-row">
              <span className="setting-label">Theme</span>
              <div className="radio-row radio-inline">
                {(["system", "light", "dark"] as Theme[]).map((t) => (
                  <label key={t}>
                    <input
                      type="radio"
                      checked={settings.theme === t}
                      onChange={() => void updateSettings({ theme: t })}
                    />
                    {capitalize(t)}
                  </label>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <label className="slider-row">
                <span>Bookmark columns</span>
                <input
                  type="range"
                  min={1}
                  max={2}
                  value={settings.bookmarkColumns}
                  onChange={(e) =>
                    void updateSettings({
                      bookmarkColumns: Number(e.target.value),
                    })
                  }
                />
                <span className="slider-value">{settings.bookmarkColumns}</span>
              </label>
            </div>
            <div className="setting-row">
              <label className="slider-row">
                <span>Tab columns</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  value={settings.tabColumns}
                  onChange={(e) =>
                    void updateSettings({ tabColumns: Number(e.target.value) })
                  }
                />
                <span className="slider-value">{settings.tabColumns}</span>
              </label>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Tab Sort</h2>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.tabSortEnabled}
              onChange={(e) =>
                void updateSettings({ tabSortEnabled: e.target.checked })
              }
            />
            Enabled
          </label>
        </div>
        {settings.tabSortEnabled && (
          <div className="sub-settings">
            <div className="setting-row">
              <span className="setting-label">Default sort</span>
              <div className="radio-row">
                {(["title", "website", "lastAccessed"] as SortMode[]).map(
                  (m) => (
                    <label key={m}>
                      <input
                        type="radio"
                        checked={settings.defaultSortMode === m}
                        onChange={() =>
                          void updateSettings({ defaultSortMode: m })
                        }
                      />
                      {capitalize(toLabel(m))}
                    </label>
                  ),
                )}
              </div>
            </div>
            <div className="button-grid">
              <button type="button" onClick={() => void runSort("title")}>
                By Title
              </button>
              <button type="button" onClick={() => void runSort("website")}>
                By Website
              </button>
              <button
                type="button"
                onClick={() => void runSort("lastAccessed")}
              >
                By Last Accessed
              </button>
            </div>
            {sortStatus && (
              <p
                className={
                  sortStatus.startsWith("Error")
                    ? "status status-error"
                    : "status status-info"
                }
              >
                {sortStatus}
              </p>
            )}
            <p className="shortcut">{sortShortcut}: Sort using default order</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Tab Shift</h2>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.tabShiftEnabled}
              onChange={(e) =>
                void updateSettings({ tabShiftEnabled: e.target.checked })
              }
            />
            Enabled
          </label>
        </div>
        {settings.tabShiftEnabled && (
          <div className="sub-settings">
            <div className="button-grid direction-grid">
              <button type="button" onClick={() => void moveTab("up")}>
                Up
              </button>
              <button type="button" onClick={() => void moveTab("down")}>
                Down
              </button>
              <button type="button" onClick={() => void moveTab("left")}>
                Left
              </button>
              <button type="button" onClick={() => void moveTab("right")}>
                Right
              </button>
            </div>
            {shiftStatus && (
              <p
                className={
                  shiftStatus.startsWith("Error")
                    ? "status status-error"
                    : "status status-info"
                }
              >
                {shiftStatus}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function actionToMessage(mode: SortMode): string {
  if (mode === "title") return "sortByTitle";
  if (mode === "lastAccessed") return "sortByLastAccessed";
  return "sortByWebsite";
}

function toLabel(mode: SortMode): string {
  if (mode === "lastAccessed") return "last accessed";
  return mode;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default App;
