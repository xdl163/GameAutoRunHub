export function isCapacitorNative() {
  const platform = window.Capacitor?.getPlatform?.();
  if (platform && platform !== "web") return true;

  return !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
}

export function getApiBase() {
  return isCapacitorNative() ? "http://83.229.125.195:8055" : "";
}

export const API_BASE = getApiBase();
