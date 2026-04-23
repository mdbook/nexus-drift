import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

if (import.meta.env.DEV) {
  // 3.1.3: dev tab gets a tinted favicon and "[DEV]" title prefix so the
  // production tab and the dev tab are distinct at a glance. Only the SVG
  // variant ships a -dev asset, so narrow the swap to the SVG link — raster
  // icons stay pointed at production assets (browsers with SVG support render
  // the tinted icon; older raster-only browsers fall back to the prod icon).
  document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"][type="image/svg+xml"]').forEach((link) => {
    link.href = link.href.replace(/nexus-drift(\.[a-z]+)/, "nexus-drift-dev$1");
  });
  if (!document.title.startsWith("[DEV]")) {
    document.title = `[DEV] ${document.title}`;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
