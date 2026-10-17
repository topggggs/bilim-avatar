// Runs before the stylesheet paints so a dark-theme visitor never sees a light flash. It is a
// separate file because the CSP forbids inline scripts; src/theme.ts owns the theme afterwards.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('bilim-theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark')
    theme =
      window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
