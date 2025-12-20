export function isCapacitorNative() {
  return !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
}

export const API_BASE = isCapacitorNative()
  ? "http://83.229.125.195:8055" // App 环境
  : ""; // 浏览器同源
