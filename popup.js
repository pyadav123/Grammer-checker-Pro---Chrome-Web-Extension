document.addEventListener("DOMContentLoaded", function () {
  // Load saved settings and stats
  loadSettings();
  loadStats();

  // Settings listeners
  document.getElementById("autoCheck").addEventListener("change", function () {
    saveSettings();
  });

  document
    .getElementById("showSuggestions")
    .addEventListener("change", function () {
      saveSettings();
    });

  document
    .getElementById("languageSelect")
    .addEventListener("change", function () {
      saveSettings();
    });

  // Check now button
  document
    .getElementById("checkNowBtn")
    .addEventListener("click", function () {
      checkCurrentPage();
    });

  // Clear stats
  document
    .getElementById("clearStats")
    .addEventListener("click", function (e) {
      e.preventDefault();
      clearStats();
    });

  // Listen for stats updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "statsUpdate") {
      updateStatsDisplay(message.stats);
    }
  });
});

function loadSettings() {
  chrome.storage.sync.get(
    {
      autoCheck: true,
      showSuggestions: true,
      language: "en-US",
    },
    function (settings) {
      document.getElementById("autoCheck").checked = settings.autoCheck;
      document.getElementById("showSuggestions").checked =
        settings.showSuggestions;
      document.getElementById("languageSelect").value = settings.language;
    }
  );
}

function saveSettings() {
  const settings = {
    autoCheck: document.getElementById("autoCheck").checked,
    showSuggestions: document.getElementById("showSuggestions").checked,
    language: document.getElementById("languageSelect").value,
  };

  chrome.storage.sync.set(settings, function () {
    // Notify content scripts of settings change
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "settingsUpdated",
          settings: settings,
        });
      }
    });
  });
}

function loadStats() {
  chrome.storage.local.get(
    {
      errorsFound: 0,
      correctionsMade: 0,
      pagesChecked: 0,
    },
    function (stats) {
      updateStatsDisplay(stats);
    }
  );
}

function updateStatsDisplay(stats) {
  animateNumber("errorsFound", stats.errorsFound || 0);
  animateNumber("correctionsMade", stats.correctionsMade || 0);
  animateNumber("pagesChecked", stats.pagesChecked || 0);
}

function animateNumber(elementId, targetValue) {
  const element = document.getElementById(elementId);
  const currentValue = parseInt(element.textContent) || 0;
  const difference = targetValue - currentValue;

  if (difference === 0) return;

  const steps = 20;
  const stepValue = difference / steps;
  let current = currentValue;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    current += stepValue;

    if (step >= steps) {
      element.textContent = targetValue;
      clearInterval(interval);
    } else {
      element.textContent = Math.round(current);
    }
  }, 30);
}

function checkCurrentPage() {
  const btn = document.getElementById("checkNowBtn");
  btn.innerHTML = '<span>⏳</span> Checking...';
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "checkAll" },
        function (response) {
          btn.innerHTML = '<span>🔍</span> Check Current Page';
          btn.disabled = false;

          if (response && response.found !== undefined) {
            const statusTitle = document.getElementById("pageStatusTitle");
            const statusSub = document.getElementById("pageStatusSub");
            const pageStatus = document.getElementById("pageStatus");

            if (response.found === 0) {
              statusTitle.textContent = "✅ No issues found!";
              statusSub.textContent = "Your text looks great";
              pageStatus.style.borderColor = "#48bb78";
            } else {
              statusTitle.textContent = `⚠️ ${response.found} issue(s) found`;
              statusSub.textContent = "Click in text fields to see details";
              pageStatus.style.borderColor = "#fc8181";
            }

            // Update stats
            chrome.storage.local.get(
              { pagesChecked: 0, errorsFound: 0 },
              function (stats) {
                chrome.storage.local.set({
                  pagesChecked: stats.pagesChecked + 1,
                  errorsFound: stats.errorsFound + response.found,
                });
                loadStats();
              }
            );
          }
        }
      );
    }
  });
}

function clearStats() {
  chrome.storage.local.set(
    {
      errorsFound: 0,
      correctionsMade: 0,
      pagesChecked: 0,
    },
    function () {
      loadStats();
    }
  );
}