import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { RiArrowRightLine, RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { LoginModal } from "@/components/application/auth/login-modal";
import { authenticate } from "@/lib/api/auth";
import welcomeCover from "@/assets/login-page-dithered.webp";
import intelligenceCover from "@/assets/blue-ridge-main-dithered.png";
import { cx } from "@/utils/cx";
import { WelcomeArt } from "./welcome-art";
import "./welcome-modal.css";

export function WelcomeModal({
  isFirstVisit,
  onComplete,
}: {
  isFirstVisit: boolean;
  onComplete: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    if (!isFirstVisit) return;
    // Let the map paint before introducing the welcome card.
    const timer = window.setTimeout(() => setReady(true), 850);
    return () => window.clearTimeout(timer);
  }, [isFirstVisit]);

  return (
    <>
      <DialogPrimitive.Root
        open={isFirstVisit && ready}
        onOpenChange={(open) => { if (!open) onComplete(); }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
            <DialogPrimitive.Popup className="welcome-card relative w-full max-w-lg max-h-[calc(100dvh-32px)] overflow-y-auto rounded-3xl border border-border-button-default bg-background-primary-default text-text-primary shadow-2xl outline-none transition-[opacity,transform] duration-200 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none">
              <div className="welcome-media relative m-2 mb-0 overflow-hidden rounded-2xl bg-background-secondary-default">
                <img src={step === 1 ? welcomeCover : intelligenceCover} alt="" className="h-44 w-full object-cover sm:h-56" />
                <WelcomeArt step={step} />
              </div>
              <DialogPrimitive.Close render={<Button variant="secondary" iconOnly leadingIcon={RiCloseLine} aria-label="Lewati pengantar dan jelajahi peta" className="absolute right-5 top-5 size-11 rounded-full" />} />

              <div className="px-6 pb-6 pt-6 sm:px-8">
                <div key={step} aria-live="polite" className="welcome-step" data-direction={direction}>
                  <DialogPrimitive.Title className="text-display-xs font-semibold tracking-tight">
                    {step === 1 ? "Pahami kondisi Indonesia saat ini." : "Satu peta. Banyak sinyal. Satu platform."}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-3 text-body-large text-text-secondary">
                    {step === 1
                      ? "Jelajahi kondisi lingkungan, temukan yang perlu perhatian, dan tanyakan apa saja tentang data kepada Arkamap."
                      : "Arkamap menghubungkan data lingkungan, menganalisis keterkaitannya, dan membantu Anda memahami apa yang penting."}
                  </DialogPrimitive.Description>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border px-6 py-5 sm:px-8">
                <div className="flex items-center" role="group" aria-label="Langkah pengantar">
                  {([1, 2] as const).map((item) => (
                    <Button
                      key={item}
                      variant="ghost"
                      className={cx("welcome-step-indicator size-11", item === 1 ? "justify-end pr-1" : "justify-start pl-1")}
                      aria-label={item === 1 ? "Pengantar" : "Tentang Arkamap"}
                      aria-current={item === step ? "step" : undefined}
                      onClick={() => { if (item !== step) { setDirection(item < step ? "previous" : "next"); setStep(item); } }}
                    >
                      <span aria-hidden="true" className={cx("block h-1.5 rounded-full bg-accent-500 transition-opacity duration-200 motion-reduce:transition-none", item === step ? "w-5" : "w-1.5 opacity-35")} />
                    </Button>
                  ))}
                </div>
                {step === 1 ? (
                  <Button className="h-11 w-full px-4 sm:w-auto" trailingIcon={RiArrowRightLine} onClick={() => { setDirection("next"); setStep(2); }}>Jelajahi Indonesia</Button>
                ) : (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button variant="secondary" className="h-11 px-3" onClick={onComplete}>Lanjut sebagai tamu</Button>
                    <Button className="h-11 px-4" onClick={() => { onComplete(); setIsLoginOpen(true); }}>Masuk</Button>
                  </div>
                )}
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Viewport>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} authenticate={authenticate} />
    </>
  );
}
