import { loadSortRules, loadSubdomainRules, saveDomainRules, saveHostRules } from "../../utils/settings";
import { APEX, OTHERS, normalizeRule, normalizeSubdomain, splitHost } from "../../utils/sort";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * One reorderable rule list in the dialog. Row order in `list` is the rule
 * order. Fixed rows (no input: Others, and the bare-domain row for subdomains)
 * carry their stored marker in `data-value` and can move but not be deleted.
 */
interface RuleSection {
  /** Row values in order: the fixed marker, or `normalize(input)` (blank → `OTHERS`, invalid → `null`). */
  values: () => (string | null)[];
  /** First problem with the rows, prefixed with the section name, or "". */
  problem: () => string;
  /** Replaces all rows with `rules`; values in `fixed` become fixed rows with that label, others show `display(value)`. */
  reset: (rules: string[]) => void;
  /** Appends an input row and returns it. */
  addRow: (value: string) => HTMLLIElement;
}

function ruleSection(
  list: HTMLUListElement,
  opts: {
    name: string;
    inputLabel: string;
    placeholder: string;
    hintId: string;
    fixed: Map<string, string>;
    /** Input text for a stored rule; `normalize(display(rule))` must return `rule`. */
    display: (rule: string) => string;
    normalize: (input: string) => string | null;
    invalid: string;
    onChange: () => void;
  },
): RuleSection {
  const values = () =>
    [...list.children].map((li) => {
      const input = li.querySelector("input");
      return input ? opts.normalize(input.value) : (li as HTMLElement).dataset.value!;
    });

  function problem(): string {
    const rows = [...list.children];
    const vals = values();
    let text = "";
    if (rows.some((li, i) => li.querySelector("input") && vals[i] === OTHERS)) {
      text = "Fill in or delete the empty rows.";
    } else if (vals.includes(null)) {
      text = opts.invalid;
    } else {
      const named = vals.filter((_, i) => rows[i]!.querySelector("input"));
      const dup = named.find((v, i) => named.indexOf(v) !== i);
      if (dup) text = `Duplicate: ${dup}`;
    }
    return text && `${opts.name}: ${text}`;
  }

  const swap = (li: Element, other: Element | null, after: boolean) => {
    if (!other) return;
    if (after) other.after(li);
    else other.before(li);
    opts.onChange();
  };

  function addRow(value: string, fixedLabel?: string) {
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
    if (fixedLabel !== undefined) {
      li.dataset.value = value;
      middle = document.createElement("span");
      middle.className = "rule-others";
      middle.textContent = fixedLabel;
    } else {
      const input = document.createElement("input");
      input.value = value;
      input.placeholder = opts.placeholder;
      input.setAttribute("aria-label", opts.inputLabel);
      input.setAttribute("aria-describedby", opts.hintId);
      input.addEventListener("input", opts.onChange);
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
    if (fixedLabel === undefined) {
      li.append(button("✕", "Delete", () => { li.remove(); opts.onChange(); }));
    }
    list.append(li);
    return li;
  }

  return {
    values,
    problem,
    reset(rules) {
      list.replaceChildren();
      for (const rule of rules) {
        const label = opts.fixed.get(rule);
        addRow(label === undefined ? opts.display(rule) : rule, label);
      }
    },
    addRow: (value) => addRow(value),
  };
}

/**
 * Wires the "Customized sorting rules" button and dialog for the active tab.
 * The dialog has a subdomain section for the registrable domain (hidden for IP
 * addresses and single-label hosts) and a path section for the exact hostname.
 * One Save writes both. Saving is blocked while any row is blank, invalid, or
 * duplicated; rows are never fixed silently.
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
  const { domain, subdomains } = splitHost(host);
  const hasSubdomains = host.includes(".") && !/^[\d.]+$|^\[/.test(host);

  const dialog = $<HTMLDialogElement>("rules-dialog");
  const error = $<HTMLElement>("rules-error");
  const saveButtons = [$("rules-save"), $("rules-save-sort")] as HTMLButtonElement[];
  const open = $<HTMLButtonElement>("rules-open");
  open.textContent = `Customized sorting rules for ${hasSubdomains ? domain : host}`;
  open.hidden = false;
  $("rules-title").textContent = `Sorting rules for ${host}`;
  $("subdomain-title").textContent = `Subdomain order for ${domain}`;
  $("rules-path-title").textContent = `Path order for ${host}`;
  $("subdomain-section").hidden = !hasSubdomains;
  $("subdomain-add-current").hidden = subdomains.length === 0;

  function validate() {
    const text = (hasSubdomains && subdomainSection.problem()) || pathSection.problem();
    error.textContent = text;
    saveButtons.forEach((b) => (b.disabled = !!text));
  }

  const subdomainSection = ruleSection($("subdomain-list"), {
    name: "Subdomains",
    inputLabel: "Subdomain",
    placeholder: "www",
    hintId: "subdomain-hint",
    fixed: new Map([[APEX, `${domain} (no subdomain)`], [OTHERS, "Others"]]),
    display: (rule) => `${rule}.${domain}`,
    normalize: (input) => normalizeSubdomain(input, domain),
    invalid: `Not a subdomain of ${domain}`,
    onChange: validate,
  });
  const pathSection = ruleSection($("rules-list"), {
    name: "Paths",
    inputLabel: "Path",
    placeholder: "docs/api",
    hintId: "rules-hint",
    fixed: new Map([[OTHERS, "Others"]]),
    display: (rule) => rule,
    normalize: normalizeRule,
    invalid: "",
    onChange: validate,
  });

  open.addEventListener("click", async () => {
    const [pathRules, domainRules] = await Promise.all([loadSortRules(), loadSubdomainRules()]);
    // No saved rules: bare domain then Others (today's order); current path then Others.
    subdomainSection.reset(domainRules[domain] ?? [APEX, OTHERS]);
    pathSection.reset(pathRules[host] ?? [normalizeRule(url.pathname), OTHERS]);
    validate();
    dialog.showModal();
  });

  const add = (section: RuleSection, value: string) => {
    const input = section.addRow(value).querySelector("input")!;
    if (!value) input.focus();
    validate();
  };
  $("subdomain-add").addEventListener("click", () => add(subdomainSection, ""));
  $("subdomain-add-current").addEventListener("click", () => add(subdomainSection, host));
  $("rules-add").addEventListener("click", () => add(pathSection, ""));
  $("rules-add-current").addEventListener("click", () => add(pathSection, normalizeRule(url.pathname)));
  $("rules-cancel").addEventListener("click", () => dialog.close());

  const save = async (andSort: boolean) => {
    validate();
    if (error.textContent) return;
    await Promise.all([
      hasSubdomains && saveDomainRules(domain, subdomainSection.values() as string[]),
      saveHostRules(host, pathSection.values() as string[]),
    ]);
    dialog.close();
    if (andSort) await sortByWebsite();
  };
  $("rules-save").addEventListener("click", () => void save(false));
  $("rules-save-sort").addEventListener("click", () => void save(true));
}
