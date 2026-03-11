// Content script - runs on all web pages
(function () {
  "use strict";

  let checkTimeout = null;
  let activeElement = null;
  let currentMatches = [];
  let tooltip = null;

  // Initialize the extension
  function init() {
    createTooltip();
    attachListeners();
    observeDOM();
  }

  // Create tooltip element
  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "grammar-checker-tooltip";
    tooltip.className = "gc-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
  }

  // Attach event listeners to text inputs
  function attachListeners() {
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("click", handleDocumentClick, true);
  }

  // Observe DOM for dynamically added elements
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const inputs = node.querySelectorAll
              ? node.querySelectorAll(
                  'textarea, input[type="text"], [contenteditable="true"]'
                )
              : [];
            inputs.forEach(attachInputListener);

            if (
              node.tagName === "TEXTAREA" ||
              (node.tagName === "INPUT" && node.type === "text") ||
              node.contentEditable === "true"
            ) {
              attachInputListener(node);
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Attach input listener to a specific element
  function attachInputListener(element) {
    element.addEventListener("input", handleInput);
  }

  // Handle focus in event
  function handleFocusIn(e) {
    const target = e.target;
    if (isTextInput(target)) {
      activeElement = target;
      target.addEventListener("input", handleInput);

      // Add grammar checker icon
      showCheckerIcon(target);

      // Check existing text
      const text = getTextFromElement(target);
      if (text && text.trim().length > 10) {
        scheduleCheck(text, target);
      }
    }
  }

  // Handle focus out event
  function handleFocusOut(e) {
    setTimeout(() => {
      if (!document.activeElement || !isTextInput(document.activeElement)) {
        hideCheckerIcon();
      }
    }, 200);
  }

  // Handle input event
  function handleInput(e) {
    const target = e.target;
    const text = getTextFromElement(target);

    clearTimeout(checkTimeout);

    if (text && text.trim().length > 10) {
      checkTimeout = setTimeout(() => {
        scheduleCheck(text, target);
      }, 1500); // Wait 1.5 seconds after typing stops
    } else {
      clearUnderlines(target);
    }
  }

  // Schedule grammar check
  function scheduleCheck(text, element) {
    chrome.runtime.sendMessage(
      { action: "checkGrammar", text: text },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log("Grammar checker: Extension context error");
          return;
        }

        if (response && response.success) {
          currentMatches = response.data.matches || [];
          displayErrors(currentMatches, element);
          updateBadge(currentMatches.length);
        }
      }
    );
  }

  // Display errors with underlines
  function displayErrors(matches, element) {
    if (!matches || matches.length === 0) {
      clearUnderlines(element);
      return;
    }

    // For contenteditable elements
    if (element.contentEditable === "true") {
      highlightContentEditable(matches, element);
    } else {
      // For textarea/input - show visual indicator
      showErrorIndicator(element, matches.length);
    }
  }

  // Highlight errors in contenteditable
  function highlightContentEditable(matches, element) {
    const originalText = element.innerText;
    let html = originalText;

    // Sort matches by offset (reverse) to avoid position shifts
    const sortedMatches = [...matches].sort(
      (a, b) => b.offset - a.offset
    );

    sortedMatches.forEach((match) => {
      const errorText = originalText.substring(
        match.offset,
        match.offset + match.length
      );
      const category = match.rule.category.id.toLowerCase();
      const cssClass =
        category === "typos"
          ? "gc-error-spelling"
          : "gc-error-grammar";

      // We'll handle this differently - just use indicator
    });

    showErrorIndicator(element, matches.length);
  }

  // Show error indicator next to element
  function showErrorIndicator(element, errorCount) {
    // Remove existing indicator
    const existingIndicator = document.getElementById(
      "gc-error-indicator"
    );
    if (existingIndicator) existingIndicator.remove();

    if (errorCount === 0) return;

    const rect = element.getBoundingClientRect();
    const indicator = document.createElement("div");
    indicator.id = "gc-error-indicator";
    indicator.className = "gc-indicator";
    indicator.innerHTML = `
      <span class="gc-indicator-count">${errorCount}</span>
      <span class="gc-indicator-text">
        ${errorCount === 1 ? "issue" : "issues"}
      </span>
    `;

    indicator.style.position = "fixed";
    indicator.style.top = `${rect.bottom - 30}px`;
    indicator.style.right = `${window.innerWidth - rect.right}px`;
    indicator.style.zIndex = "999999";

    indicator.addEventListener("click", () => {
      showErrorPanel(currentMatches, element);
    });

    document.body.appendChild(indicator);
  }

  // Show error panel with suggestions
  function showErrorPanel(matches, element) {
    const existingPanel = document.getElementById("gc-error-panel");
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const rect = element.getBoundingClientRect();
    const panel = document.createElement("div");
    panel.id = "gc-error-panel";
    panel.className = "gc-panel";

    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 5}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.zIndex = "999999";
    panel.style.maxWidth = `${Math.min(400, rect.width)}px`;

    let panelHTML = `
      <div class="gc-panel-header">
        <span class="gc-panel-title">✍️ Grammar Checker</span>
        <button class="gc-panel-close" id="gc-close-btn">✕</button>
      </div>
      <div class="gc-panel-body">
    `;

    if (matches.length === 0) {
      panelHTML += `
        <div class="gc-no-errors">
          <span>✅ No issues found!</span>
        </div>
      `;
    } else {
      matches.forEach((match, index) => {
        const suggestions = match.replacements
          .slice(0, 3)
          .map((r) => r.value);
        const category = match.rule.category.id.toLowerCase();
        const iconClass =
          category === "typos" ? "gc-spelling-icon" : "gc-grammar-icon";
        const icon = category === "typos" ? "🔴" : "🟡";

        panelHTML += `
          <div class="gc-error-item" data-index="${index}">
            <div class="gc-error-header">
              <span class="gc-error-icon">${icon}</span>
              <span class="gc-error-message">${match.message}</span>
            </div>
            <div class="gc-error-context">
              <span class="gc-context-text">"${match.context.text.substring(
                Math.max(0, match.context.offset - 10),
                match.context.offset + match.context.length + 10
              )}"</span>
            </div>
            ${
              suggestions.length > 0
                ? `
              <div class="gc-suggestions">
                <span class="gc-suggestions-label">Suggestions:</span>
                ${suggestions
                  .map(
                    (s) => `
                  <button class="gc-suggestion-btn" 
                    data-suggestion="${s}" 
                    data-offset="${match.offset}"
                    data-length="${match.length}">
                    ${s}
                  </button>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }
            <div class="gc-error-rule">
              Rule: ${match.rule.description}
            </div>
          </div>
        `;
      });
    }

    panelHTML += `</div>`;
    panel.innerHTML = panelHTML;

    document.body.appendChild(panel);

    // Close button
    document.getElementById("gc-close-btn").addEventListener("click", () => {
      panel.remove();
    });

    // Suggestion buttons
    panel.querySelectorAll(".gc-suggestion-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        applySuggestion(
          element,
          parseInt(btn.dataset.offset),
          parseInt(btn.dataset.length),
          btn.dataset.suggestion
        );
        panel.remove();
      });
    });

    // Close when clicking outside
    setTimeout(() => {
      document.addEventListener(
        "click",
        function closePanel(e) {
          if (!panel.contains(e.target) && e.target.id !== "gc-error-indicator") {
            panel.remove();
            document.removeEventListener("click", closePanel);
          }
        }
      );
    }, 100);
  }

  // Apply suggestion to fix error
  function applySuggestion(element, offset, length, suggestion) {
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      const text = element.value;
      const newText =
        text.substring(0, offset) + suggestion + text.substring(offset + length);
      element.value = newText;

      // Trigger input event to recheck
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (element.contentEditable === "true") {
      const text = element.innerText;
      const newText =
        text.substring(0, offset) + suggestion + text.substring(offset + length);
      element.innerText = newText;

      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Clear underlines from element
  function clearUnderlines(element) {
    const existingIndicator = document.getElementById("gc-error-indicator");
    if (existingIndicator) existingIndicator.remove();

    const existingPanel = document.getElementById("gc-error-panel");
    if (existingPanel) existingPanel.remove();
  }

  // Show checker icon
  function showCheckerIcon(element) {
    // Icon is shown as part of the error indicator
  }

  // Hide checker icon
  function hideCheckerIcon() {
    setTimeout(() => {
      const indicator = document.getElementById("gc-error-indicator");
      if (indicator) indicator.remove();
    }, 500);
  }

  // Handle document click
  function handleDocumentClick(e) {
    if (
      !e.target.closest("#gc-error-panel") &&
      e.target.id !== "gc-error-indicator"
    ) {
      // Panel closes itself
    }
  }

  // Update extension badge
  function updateBadge(count) {
    chrome.runtime.sendMessage({
      action: "updateBadge",
      count: count,
    });
  }

  // Check if element is a text input
  function isTextInput(element) {
    if (!element) return false;
    const tag = element.tagName;
    return (
      tag === "TEXTAREA" ||
      (tag === "INPUT" &&
        ["text", "email", "search", "url"].includes(element.type)) ||
      element.contentEditable === "true"
    );
  }

  // Get text from element
  function getTextFromElement(element) {
    if (
      element.tagName === "TEXTAREA" ||
      element.tagName === "INPUT"
    ) {
      return element.value;
    } else if (element.contentEditable === "true") {
      return element.innerText;
    }
    return "";
  }

  // Initialize
  init();
})();