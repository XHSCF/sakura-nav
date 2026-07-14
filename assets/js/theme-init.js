(function () {
  "use strict";

  let saved = null;
  try {
    saved = window.localStorage.getItem("sakura-theme");
  } catch (_) {}

  const mode = saved === "light" || saved === "dark" ? saved : "auto";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = mode === "auto"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
})();
