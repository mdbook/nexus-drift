// Beta build detection based on deploy hostname.
// Beta hosts: `nexus-drift-beta.mdbook.me` and `nexus-drift-beta.*.mdbook.one`.
// Production hosts: `nexus-drift.mdbook.me` and `nexus-drift.*.mdbook.one`.
// `import.meta.env.DEV` also counts so `npm run dev` still shows the marker.
export function isBetaBuild(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname.startsWith("nexus-drift-beta");
}
