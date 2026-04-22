import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

if (import.meta.env.DEV) {
  // 3.1.3: dev tab gets a tinted favicon and "[DEV]" title prefix so the
  // production tab and the dev tab are distinct at a glance. Only the SVG
  // variant ships a -dev asset; the JS swap on missing files is harmless
  // (the browser falls through to the next icon link).
  document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]').forEach((link) => {
    link.href = link.href.replace(
      /(favicon|nexus-drift|apple-touch-icon)(-\d+x\d+)?(\.[a-z]+)/,
      "$1-dev$2$3",
    );
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
