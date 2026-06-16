import {
  DEFAULT_API_BASE_URL,
  STORAGE_KEY_API_BASE_URL,
} from "./types";

const input = document.getElementById("api-base-url") as HTMLInputElement;
const saveButton = document.getElementById("save-button") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;

async function loadSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY_API_BASE_URL);
  const value = stored[STORAGE_KEY_API_BASE_URL];
  input.value =
    typeof value === "string" && value.trim() ? value : DEFAULT_API_BASE_URL;
}

saveButton.addEventListener("click", async () => {
  const apiBaseUrl = input.value.trim().replace(/\/$/, "") || DEFAULT_API_BASE_URL;

  await chrome.storage.sync.set({
    [STORAGE_KEY_API_BASE_URL]: apiBaseUrl,
  });

  status.textContent = "設定已儲存";
  status.style.color = "#166534";
});

void loadSettings();
