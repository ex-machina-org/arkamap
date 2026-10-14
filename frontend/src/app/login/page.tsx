import { authenticate } from "@/lib/api/auth";
import { useState } from "react";
import { LoginModal } from "@/components/application/auth/login-modal";
import Rays from "@/components/ui/light-rays";

export default function LoginPage() {
  const [isOpen, setIsOpen] = useState(true);

  function handleClose() {
    setIsOpen(false);
    setTimeout(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 250);
  }

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background-full">
      <Rays
        className="pointer-events-none absolute inset-0"
        backgroundColor="transparent"
        position={50}
        intensity={20}
        reach={24}
        raysColor={{ mode: "single", color: "#10b981" }}
      />
      <LoginModal
        authenticate={authenticate}
        isOpen={isOpen}
        onClose={handleClose}
        onSuccess={() => {
          setTimeout(() => {
            window.history.pushState({}, "", "/dashboard");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }, 350);
        }}
      />
    </div>
  );
}
