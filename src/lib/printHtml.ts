/** Print inside the existing WebView2 window without opening a blocked popup.
 * Works with Tauri and browser. Keeps the print markup separate from app content.
 */
export function printHtml(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");
  root.id = "school-print-root";
  root.setAttribute("dir", "rtl");
  root.innerHTML = parsed.body.innerHTML;
  const css = document.createElement("style");
  css.id = "school-print-style";
  css.textContent = `@media screen { #school-print-root { display: none !important; } }
@media print {
  body > :not(#school-print-root) { display: none !important; }
  #school-print-root { display: block !important; width: 100% !important; }
  @page { size: A4; margin: 12mm; }
}
` + [...parsed.querySelectorAll("style")].map(s => s.textContent ?? "").join("\n");
  const previous = document.getElementById("school-print-root");
  previous?.remove();
  document.getElementById("school-print-style")?.remove();
  document.head.appendChild(css);
  document.body.appendChild(root);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", cleanup);
    root.remove();
    css.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  // Permit paint of print-only markup prior to opening native print dialog.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { window.print(); } catch (error) { cleanup(); throw error; }
    // Some WebView2 versions never emit afterprint; don't keep print-only DOM forever.
    setTimeout(cleanup, 120000);
  }));
}
