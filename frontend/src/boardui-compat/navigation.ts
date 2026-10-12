import { useSyncExternalStore } from "react";

const pathname = () => window.location.pathname;
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

export function usePathname() {
  return useSyncExternalStore(subscribe, pathname, () => "/");
}

export function useRouter() {
  return {
    push(path: string) {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  };
}
