import { useState } from "react";

const WELCOME_STORAGE_KEY = "arkamap:welcome-completed:v1";

export function useFirstVisit() {
  const [isFirstVisit, setIsFirstVisit] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });

  function completeWelcome() {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    } catch {
      // Browsers that block storage can still enter the map for this visit.
    }
    setIsFirstVisit(false);
  }

  return { isFirstVisit, completeWelcome };
}
