import { describe, expect, it } from "vitest";
import {
  compareFlatVersions,
  extractFlatVersion,
  extractVersionFromPayload,
  fetchLiveVersion,
  getPreviewLiveVersion,
} from "@/lib/versionCheck";

describe("version check helpers", () => {
  it("extracts a flat semver string from raw text", () => {
    expect(extractFlatVersion("2.3.3")).toBe("2.3.3");
    expect(extractFlatVersion("live version: v2.4.0")).toBe("2.4.0");
    expect(extractFlatVersion("no version here")).toBeNull();
  });

  it("finds nested version strings in structured payloads", () => {
    expect(extractVersionFromPayload({ version: "2.3.3" })).toBe("2.3.3");
    expect(extractVersionFromPayload({ meta: { live: "v2.4.1" } })).toBe("2.4.1");
    expect(extractVersionFromPayload([{ label: "stable" }, { current: "2.5.0" }])).toBe("2.5.0");
  });

  it("compares flat semver numerically", () => {
    expect(compareFlatVersions("2.3.4", "2.3.3")).toBeGreaterThan(0);
    expect(compareFlatVersions("2.3.3", "2.3.3")).toBe(0);
    expect(compareFlatVersions("2.3.3", "2.4.0")).toBeLessThan(0);
  });

  it("builds a preview version one patch ahead of the current build", () => {
    expect(getPreviewLiveVersion("2.3.3")).toBe("2.3.4");
    expect(getPreviewLiveVersion("4.9.19")).toBe("4.9.20");
  });

  it("reads plain text version responses", async () => {
    const fetchMock = (async () =>
      new Response("2.3.4", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    await expect(fetchLiveVersion(fetchMock)).resolves.toBe("2.3.4");
  });

  it("reads nested json version responses", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ release: { version: "2.4.0" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(fetchLiveVersion(fetchMock)).resolves.toBe("2.4.0");
  });

  it("returns null for invalid or failed responses", async () => {
    const invalidFetch = (async () => new Response("coming soon", { status: 200 })) as typeof fetch;
    const failedFetch = (async () => new Response("2.4.0", { status: 503 })) as typeof fetch;

    await expect(fetchLiveVersion(invalidFetch)).resolves.toBeNull();
    await expect(fetchLiveVersion(failedFetch)).resolves.toBeNull();
  });
});
