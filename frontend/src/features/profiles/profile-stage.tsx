import type { ReactNode } from "react";
import { ArkamapLockup } from "@/components/foundations/brand/arkamap-brand";
import horizon from "@/assets/login-page-dithered.webp";

/** The full-screen canvas the profile picker and onboarding share, so moving between them reads as one place. */
export function ProfileStage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background-full text-text-primary">
      {/* The login landscape returns as a faint horizon so sign-in and these steps read as one passage. */}
      <img src={horizon} alt="" className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh] w-full object-cover opacity-30 [mask-image:linear-gradient(to_top,black,transparent)] dark:opacity-20" />
      <header className="relative flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <ArkamapLockup />
        {actions}
      </header>
      {children}
    </main>
  );
}
