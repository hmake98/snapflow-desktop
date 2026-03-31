import { useEffect } from "react";
import { useStore } from "../store/useStore";

/**
 * Monitors navigator.onLine and syncs it into the Zustand store.
 * Mount once in _app.tsx; all other components read from the store.
 */
export function useNetworkStatus() {
  const setIsOnline = useStore((s) => s.setIsOnline);
  const processSyncQueue = useStore((s) => s.processSyncQueue);

  useEffect(() => {
    // Set initial value
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setIsOnline, processSyncQueue]);
}
