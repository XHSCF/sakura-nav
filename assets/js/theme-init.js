(function () {
  "use strict";

  let saved = null;
  try {
    saved = window.localStorage.getItem("sakura-theme");
  } catch (_) {}

  document.documentElement.dataset.theme = saved === "light" || saved === "dark"
    ? saved
    : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();
