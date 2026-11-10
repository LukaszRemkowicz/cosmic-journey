declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export type Consent = "granted" | "denied" | null;

const KEY = "cookie-consent";
export const analyticsEnabled = __GA_ID__ !== "";

export function readConsent(): Consent {
  try {
    const value = localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: "granted" | "denied") {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the choice lasts only for this page view.
  }
}

export function loadAnalytics() {
  if (!analyticsEnabled || document.getElementById("gtag")) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    // gtag.js expects the raw arguments object.
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", __GA_ID__);
  const script = document.createElement("script");
  script.id = "gtag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${__GA_ID__}`;
  document.head.append(script);
}

// GA sets _ga cookies on the widest domain it can, so try every parent domain.
export function removeAnalyticsCookies() {
  // Stops gtag.js from rewriting cookies before the page reloads.
  (window as unknown as Record<string, boolean>)[`ga-disable-${__GA_ID__}`] = true;
  const parts = location.hostname.split(".");
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (let i = 0; i < parts.length; i++) {
      const domain = parts.slice(i).join(".");
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
    }
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}
