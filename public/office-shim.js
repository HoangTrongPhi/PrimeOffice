// Loaded by office.html before the office. See src/office/bridge/officeBridge.ts.
// The vendored pixel-agents office runs in its "VS Code webview" mode: this stub stands in for
// VS Code's API and forwards every ClientMessage to the PrimeOffice shell (src/office/bridge).
window.__PRIME_OFFICE__ = true;
window.acquireVsCodeApi = function () {
  return {
    postMessage: function (message) {
      window.parent.postMessage({ tag: "primeoffice-client", message: message }, "*");
    },
    getState: function () {
      return undefined;
    },
    setState: function () {},
  };
};
// Desktop-app feel: no browser context menu over the office.
window.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});
