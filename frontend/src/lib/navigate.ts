/** Moves to another route of this app without a page load: App listens for popstate, and the
 *  signed-in session stays in memory instead of being looked up again. */
export function goTo(path: string) {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
