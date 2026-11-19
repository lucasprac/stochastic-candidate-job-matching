// Applies the saved color scheme before first paint to avoid a theme flash.
// Kept as a classic script file so the CSP does not need 'unsafe-inline' for scripts.
try {
  var s = localStorage.getItem('subq-color-scheme');
  if (s === 'light' || s === 'dark') {
    document.querySelector('meta[name="color-scheme"]').content = s;
  }
} catch (_) {}
