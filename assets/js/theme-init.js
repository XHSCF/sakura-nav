(function () {
  "use strict";

  let saved = null;
  let savedColorTheme = null;
  try {
    saved = window.localStorage.getItem("sakura-theme");
    savedColorTheme = window.localStorage.getItem("sakura-color-theme");
  } catch (_) {}

  const mode = saved === "light" || saved === "dark" ? saved : "auto";
  const colorThemes = ["miku", "purple", "ocean", "apple", "sakura", "amber", "black-gold", "teal"];
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = mode === "auto"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
  document.documentElement.dataset.colorTheme = colorThemes.includes(savedColorTheme) ? savedColorTheme : "miku";
})();
