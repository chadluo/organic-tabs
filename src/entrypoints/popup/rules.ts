import { loadSortRules, saveHostRules } from "../../utils/settings";
import { OTHERS, normalizeRule } from "../../utils/sort";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Wires the "Customized sorting rules" button and dialog for the active tab's
 * hostname. Row order in `#rules-list` is the rule order; the `Others` row
 * (no input) marks where unmatched paths go. Saving is blocked while any row
 * is blank or duplicated; rows are never fixed silently.
 */
export async function initRulesDialog(sortByWebsite: () => Promise<void>) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let url: URL;
  try {
    url = new URL(tab?.url ?? "");
  } catch {
    return;
  }
  if (!/^https?:$/.test(url.protocol)) return;
  const host = url.hostname;

  const dialog = $<HTMLDialogElement>("rules-dialog");
  const list = $<HTMLUListElement>("rules-list");
  const error = $<HTMLElement>("rules-error");
  const saveButtons = [$("rules-save"), $("rules-save-sort")] as HTMLButtonElement[];
  const open = $<HTMLButtonElement>("rules-open");
  open.textContent = `Customized sorting rules for ${host}`;
  open.hidden = false;
  $("rules-title").textContent = `Sorting rules for ${host}`;

  /** Row values in order; `OTHERS` for the Others row, normalized text otherwise (blank → `OTHERS`). */
  const values = () =>
    [...list.children].map((li) => {
      const input = li.querySelector("input");
      return input ? normalizeRule(input.value) : OTHERS;
    });

  /** Returns the first problem with the rows, or "". */
  function problem(): string {
    const rows = [...list.children];
    const vals = values();
    if (rows.some((li, i) => li.querySelector("input") && vals[i] === OTHERS)) {
      return "Fill in or delete the empty rows.";
    }
    const named = vals.filter((v) => v !== OTHERS);
    const dup = named.find((v, i) => named.indexOf(v) !== i);
    return dup ? `Duplicate path: ${dup}` : "";
  }

  function validate() {
    const text = problem();
    error.textContent = text;
    saveButtons.forEach((b) => (b.disabled = !!text));
  }

  const swap = (li: Element, other: Element | null, after: boolean) => {
    if (!other) return;
    if (after) other.after(li);
    else other.before(li);
    validate();
  };

  function addRow(value: string | null) {
    const li = document.createElement("li");
    li.className = "rule-row";
    const handle = document.createElement("span");
    handle.className = "handle";
    handle.textContent = "⠿";
    handle.draggable = true;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setDragImage(li, 0, 0);
      li.classList.add("dragging");
    });
    handle.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => {
      const dragging = list.querySelector(".dragging");
      if (!dragging || dragging === li) return;
      e.preventDefault();
      const box = li.getBoundingClientRect();
      swap(dragging, li, e.clientY > box.top + box.height / 2);
    });

    let middle: HTMLElement;
    if (value === null) {
      middle = document.createElement("span");
      middle.className = "rule-others";
      middle.textContent = "Others";
    } else {
      const input = document.createElement("input");
      input.value = value;
      input.placeholder = "docs/api";
      input.setAttribute("aria-label", "Path");
      input.setAttribute("aria-describedby", "rules-hint");
      input.addEventListener("input", validate);
      middle = input;
    }

    const button = (text: string, label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", onClick);
      return b;
    };
    li.append(
      handle,
      middle,
      button("↑", "Move up", () => swap(li, li.previousElementSibling, false)),
      button("↓", "Move down", () => swap(li, li.nextElementSibling, true)),
    );
    if (value !== null) {
      li.append(button("✕", "Delete", () => { li.remove(); validate(); }));
    }
    list.append(li);
    return li;
  }

  open.addEventListener("click", async () => {
    const saved = (await loadSortRules())[host];
    list.replaceChildren();
    // No saved rules: start from the current page's path, then Others.
    for (const rule of saved ?? [normalizeRule(url.pathname), OTHERS]) {
      addRow(rule === OTHERS ? null : rule);
    }
    validate();
    dialog.showModal();
  });

  $("rules-add").addEventListener("click", () => {
    addRow("").querySelector("input")!.focus();
    validate();
  });
  $("rules-add-current").addEventListener("click", () => {
    addRow(normalizeRule(url.pathname));
    validate();
  });
  $("rules-cancel").addEventListener("click", () => dialog.close());

  const save = async (andSort: boolean) => {
    if (problem()) return;
    await saveHostRules(host, values());
    dialog.close();
    if (andSort) await sortByWebsite();
  };
  $("rules-save").addEventListener("click", () => void save(false));
  $("rules-save-sort").addEventListener("click", () => void save(true));
}
