export const VERSION_CHECK_ENDPOINT = "/version";
export const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function extractFlatVersion(value: string): string | null {
  const match = value.match(/(?:^|[^0-9])v?(\d+)\.(\d+)\.(\d+)\b/i);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function extractVersionFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") return extractFlatVersion(payload);
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const version = extractVersionFromPayload(entry);
      if (version) return version;
    }
    return null;
  }

  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      const version = extractVersionFromPayload(value);
      if (version) return version;
    }
  }

  return null;
}

export function compareFlatVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => parseInt(part, 10));
  const rightParts = right.split(".").map((part) => parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export async function fetchLiveVersion(
  fetchImpl: typeof fetch = fetch,
  endpoint = VERSION_CHECK_ENDPOINT
): Promise<string | null> {
  const response = await fetchImpl(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "text/plain, application/json;q=0.9, */*;q=0.1",
    },
  });

  if (!response.ok) return null;

  const body = (await response.text()).trim();
  if (!body) return null;

  try {
    return extractVersionFromPayload(JSON.parse(body)) ?? extractFlatVersion(body);
  } catch {
    return extractFlatVersion(body);
  }
}
