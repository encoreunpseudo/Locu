const enabledInput = document.getElementById("enabled");
const statusEl = document.getElementById("status");

function showStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => (statusEl.textContent = ""), 1500);
}

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = enabled;
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked }, () => showStatus("Enregistré"));
});

document.getElementById("reset").addEventListener("click", () => {
  chrome.storage.sync.set({ count: 0 }, () => showStatus("Compteur remis à 0"));
});
