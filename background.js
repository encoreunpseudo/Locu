// Service worker : tourne en arrière-plan, sans accès au DOM des pages.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.storage.sync.set({ enabled: true, count: 0 });
    console.log("Extension installée");
  }
});

// Réception des messages venant du popup ou du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ type: "PONG", from: "background" });
  }

  if (message.type === "INCREMENT") {
    chrome.storage.sync.get({ count: 0 }, ({ count }) => {
      const next = count + 1;
      chrome.storage.sync.set({ count: next }, () => sendResponse({ count: next }));
    });
    return true; // garde le canal ouvert pour une réponse asynchrone
  }
});
