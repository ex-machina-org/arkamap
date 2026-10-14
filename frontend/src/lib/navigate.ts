/** In-app navigation: changes the URL without a page reload and tells the router in `App`. */
export function navigate(path: string, options: { replace?: boolean } = {}) {
  window.history[options.replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Routes served by the SPA; any other same-origin path (for example `/api/*`) keeps the browser's default. */
const APP_ROUTE = /^\/(?:$|map$|siri-map$|atlas$|map-ai$|siri$|analisis$|alerts$|dashboard$|chat$|login$|onboarding$|sources$|devices(?:\/|$)|design-system(?:\/|$)|app-shell$|welcome$|prototype$)/;

/** Turns plain left-clicks on internal links into client-side navigation. Returns the cleanup function. */
export function installLinkNavigation() {
  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !APP_ROUTE.test(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  }
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
