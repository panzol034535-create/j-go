import { DEFAULT_API_BASE_URL, STORAGE_KEY_API_BASE_URL } from "./types";

const apiBaseUrlElement = document.getElementById("api-base-url") as HTMLParagraphElement;
const openOptionsLink = document.getElementById("open-options") as HTMLAnchorElement;

openOptionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function loadApiBaseUrl() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY_API_BASE_URL);
  const value = stored[STORAGE_KEY_API_BASE_URL];
  const apiBaseUrl =
    typeof value === "string" && value.trim() ? value : DEFAULT_API_BASE_URL;

  apiBaseUrlElement.textContent = `API: ${apiBaseUrl}`;
}

void loadApiBaseUrl();
