import { useEffect, useState } from "react";

export interface FeatureFlags {
  zoho: boolean;
}

let cached: FeatureFlags | null = null;

// Optimistic until the main process answers, so enabled installs don't flash a disabled state.
export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(cached ?? { zoho: true });

  useEffect(() => {
    if (cached) return;
    window.api
      .getFeatureFlags()
      .then((result: FeatureFlags) => {
        cached = result;
        setFlags(result);
      })
      .catch(() => undefined);
  }, []);

  return flags;
}
