import { useCallback, useEffect, useRef, useState } from "react";
import {
  compareFlatVersions,
  fetchLiveVersion,
  getPreviewLiveVersion,
  VERSION_CHECK_INTERVAL_MS,
} from "@/lib/versionCheck";

export function useVersionCheck(currentVersion: string) {
  const [liveVersion, setLiveVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [ignoredVersion, setIgnoredVersion] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const checkVersion = useCallback(async () => {
    if (document.hidden || inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      const nextVersion = await fetchLiveVersion();
      if (!nextVersion || compareFlatVersions(nextVersion, currentVersion) <= 0) {
        setLiveVersion(null);
        return;
      }

      setLiveVersion(nextVersion);
    } catch {
      // Ignore transient network failures; the next poll can recover.
    } finally {
      inFlightRef.current = false;
    }
  }, [currentVersion]);

  useEffect(() => {
    const initialCheckId = window.setTimeout(() => {
      void checkVersion();
    }, 0);

    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_CHECK_INTERVAL_MS);

    const handleVisibility = () => {
      if (!document.hidden) void checkVersion();
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(initialCheckId);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkVersion]);

  const updateAvailable =
    liveVersion !== null &&
    compareFlatVersions(liveVersion, currentVersion) > 0 &&
    liveVersion !== dismissedVersion &&
    liveVersion !== ignoredVersion;

  return {
    liveVersion,
    updateAvailable,
    dismissForSession: () => {
      if (liveVersion) setDismissedVersion(liveVersion);
    },
    ignoreVersion: () => {
      if (!liveVersion) return;
      setIgnoredVersion(liveVersion);
    },
    showPreviewBanner: () => {
      const previewVersion = getPreviewLiveVersion(currentVersion);
      setDismissedVersion(null);
      setIgnoredVersion(null);
      setLiveVersion(previewVersion);
    },
    refreshForUpdate: () => {
      window.location.reload();
    },
  };
}
