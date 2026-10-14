import { flushSync } from "react-dom";

/** Shared name for the card that travels between the picker's "Tambah Profil" tile and the onboarding preview. */
export const DRAFT_CARD = "profile-draft-card";

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/**
 * Moves between the picker and onboarding inside a view transition, so the card named
 * DRAFT_CARD morphs into place while the rest of the page crossfades. Without support,
 * or with reduced motion, it is a plain navigation.
 */
export function navigateWithMorph(path: string) {
  const go = () => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const transitionDocument = document as TransitionDocument;
  if (!transitionDocument.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    go();
    return;
  }
  const root = document.documentElement;
  root.classList.add("profile-morph");
  // The App router updates state in a popstate listener; flushSync lets the browser capture the new page.
  const transition = transitionDocument.startViewTransition(() => flushSync(go));
  void transition.finished.finally(() => root.classList.remove("profile-morph"));
}
