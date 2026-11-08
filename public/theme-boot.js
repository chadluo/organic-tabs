try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.style.colorScheme = t; } catch {}
