import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import {
  RiAlertFill,
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiInformationFill,
  RiLoader4Line,
} from "@remixicon/react";

export function AppToaster() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  useEffect(() => {
    const updateTheme = () => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors={false}
      closeButton
      offset="20px"
      mobileOffset="12px"
      gap={12}
      visibleToasts={4}
      icons={{
        success: <RiCheckboxCircleFill className="size-[22px] shrink-0 text-white" aria-hidden="true" />,
        error: <RiErrorWarningFill className="size-[22px] shrink-0 text-white" aria-hidden="true" />,
        warning: <RiAlertFill className="size-[22px] shrink-0 text-white" aria-hidden="true" />,
        info: <RiInformationFill className="size-[22px] shrink-0 text-white" aria-hidden="true" />,
        loading: <RiLoader4Line className="size-[22px] shrink-0 text-white animate-spin" aria-hidden="true" />,
      }}
      toastOptions={{
        className: "group/sonner-toast",
      }}
    />
  );
}
