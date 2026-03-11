// Background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkGrammar") {
    checkGrammarAPI(request.text)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message })
      );
    return true; // Keep message channel open for async response
  }
});

async function checkGrammarAPI(text) {
  const url = "https://api.languagetool.org/v2/check";

  const params = new URLSearchParams({
    text: text,
    language: "en-US",
    enabledOnly: "false",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data;
}