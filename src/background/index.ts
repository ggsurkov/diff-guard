// Full-page dashboard, not a popup/side panel: the toolbar icon click opens
// diff-guard as a regular tab so it survives losing focus mid-analysis.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/index.html") });
});
