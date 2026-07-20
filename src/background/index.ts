chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Firefox / older Chrome without setPanelBehavior support — action click falls back to default_popup (none set), no-op.
  });
});
