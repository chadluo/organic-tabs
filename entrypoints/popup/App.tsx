import { useEffect, useMemo, useState } from "react";
import "./App.css";

type SortMode = "title" | "website" | "lastAccessed";
type Direction = "up" | "down" | "left" | "right";

const DEFAULT_SORT_MODE_KEY = "defaultSortMode";

async function sendBackgroundAction(message: Record<string, unknown>) {
  const response = await browser.runtime.sendMessage(message);
  if (!response?.success) {
    throw new Error(response?.error ?? "Background action failed.");
  }
}

function App() {
  const [status, setStatus] = useState("Ready");
  const [defaultSortMode, setDefaultSortMode] = useState<SortMode>("website");
  const [shortcutHint, setShortcutHint] = useState(
    "Alt+Shift+S: Sort tabs using default order",
  );

  const statusClassName = useMemo(
    () =>
      status.toLowerCase().startsWith("error")
        ? "status status-error"
        : "status status-info",
    [status],
  );

  useEffect(() => {
    void (async () => {
      const data = await browser.storage.sync.get(DEFAULT_SORT_MODE_KEY);
      const mode =
        (data[DEFAULT_SORT_MODE_KEY] as SortMode | undefined) ?? "website";
      setDefaultSortMode(
        mode === "title" || mode === "lastAccessed" ? mode : "website",
      );
      const commands = await browser.commands.getAll();
      const sortCommand = commands.find(
        (command) => command.name === "sort-tabs",
      );
      if (sortCommand?.shortcut) {
        setShortcutHint(
          `${sortCommand.shortcut}: Sort tabs using default order`,
        );
      }
    })();
  }, []);

  async function runSort(action: SortMode) {
    try {
      setStatus(`Sorting by ${toLabel(action)}...`);
      await sendBackgroundAction({ action: actionToMessage(action) });
      setStatus(`Sorted by ${toLabel(action)}.`);
    } catch {
      setStatus("Error: failed to sort tabs.");
    }
  }

  async function setDefaultSort(mode: SortMode) {
    setDefaultSortMode(mode);
    await browser.storage.sync.set({ [DEFAULT_SORT_MODE_KEY]: mode });
    setStatus(`Default sort set to ${toLabel(mode)}.`);
  }

  async function moveTab(direction: Direction) {
    try {
      setStatus(`Moving tab ${direction}...`);
      await sendBackgroundAction({ action: "moveTabDirection", direction });
      setStatus(`Moved tab ${direction}.`);
    } catch {
      setStatus("Error: failed to move tab.");
    }
  }

  return (
    <div className="popup-root">
      <h1>Organic Tabs</h1>

      <section className="section">
        <h2>Sort Tabs</h2>
        <div className="button-grid">
          <button type="button" onClick={() => void runSort("title")}>
            By Title
          </button>
          <button type="button" onClick={() => void runSort("website")}>
            By Website
          </button>
          <button type="button" onClick={() => void runSort("lastAccessed")}>
            By Last Accessed
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Default Sort</h2>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              checked={defaultSortMode === "title"}
              onChange={() => void setDefaultSort("title")}
            />
            Title
          </label>
          <label>
            <input
              type="radio"
              checked={defaultSortMode === "website"}
              onChange={() => void setDefaultSort("website")}
            />
            Website
          </label>
          <label>
            <input
              type="radio"
              checked={defaultSortMode === "lastAccessed"}
              onChange={() => void setDefaultSort("lastAccessed")}
            />
            Last Accessed
          </label>
        </div>
      </section>

      <section className="section">
        <h2>Shift Tab Between Windows</h2>
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
      </section>

      <p className={statusClassName}>{status}</p>
      <p className="shortcut">{shortcutHint}</p>
    </div>
  );
}

function actionToMessage(mode: SortMode): string {
  if (mode === "title") {
    return "sortByTitle";
  }

  if (mode === "lastAccessed") {
    return "sortByLastAccessed";
  }

  return "sortByWebsite";
}

function toLabel(mode: SortMode): string {
  if (mode === "lastAccessed") {
    return "last accessed";
  }

  return mode;
}

export default App;
