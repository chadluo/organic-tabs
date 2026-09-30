import { saveNtpTitle } from "../../utils/settings";

export function initTitleEditor(windowId: number, initialTitle: string): void {
  const input = document.getElementById("ntp-title-input") as HTMLInputElement;
  const saveBtn = document.getElementById("ntp-title-save") as HTMLButtonElement;
  input.value = initialTitle;

  let savedTitle = initialTitle;

  async function save() {
    savedTitle = input.value;
    document.title = savedTitle;
    await saveNtpTitle(windowId, savedTitle);
    saveBtn.hidden = true;
    saveBtn.textContent = "Saved";
    setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
  }

  input.addEventListener("input", () => {
    saveBtn.hidden = input.value === savedTitle;
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void save();
  });

  saveBtn.addEventListener("click", () => void save());
}
