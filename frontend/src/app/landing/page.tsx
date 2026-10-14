import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { RiArrowRightLine, RiLoginBoxLine } from "@remixicon/react";

import { Button, ButtonLink } from "@/components/base/buttons/button";
import { LoginModal } from "@/components/application/auth/login-modal";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { ShimmerText } from "@/components/ui/shimmer-text";
import Rays from "@/components/ui/light-rays";
import "./landing.css";

export default function LandingPage() {
  const [leaving, setLeaving] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = "Ex Machina x JOINTS UGM 2026";
    return () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    };
  }, []);

  function navigateWithFade(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (event.detail === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    event.preventDefault();
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    setLeaving(true);
    const destination = event.currentTarget.href;
    const url = new URL(destination, window.location.origin);
    const targetPath = url.pathname.replace(/\/$/, "") || "/";

    navigationTimer.current = setTimeout(() => {
      window.history.pushState({}, "", targetPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 180);
  }

  return (
    <main className="landing-shell" data-leaving={leaving}>
      <Rays
        className="landing-rays pointer-events-none"
        backgroundColor="transparent"
        position={50}
        intensity={20}
        reach={24}
        raysColor={{ mode: "single", color: "#639AFF" }}
        style={{ zIndex: 0 }}
      />

      <section className="landing-content" aria-labelledby="landing-title">
        <h1 id="landing-title" className="landing-title">
          <span className="landing-title-line">
            <BlurReveal as="span" className="landing-brand" speedReveal={0.8} speedSegment={1}>Ex Machina x JOINTS UGM 2026</BlurReveal>{" "}
          </span>
          <ShimmerText className="landing-coming-soon" duration={1.8} delay={1.5}>Coming Soon</ShimmerText>
        </h1>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink variant="secondary" href="/design-system" onClick={navigateWithFade} className="min-w-36">
            Design System
          </ButtonLink>
          <Button variant="secondary" onClick={() => setLoginOpen(true)} leadingIcon={RiLoginBoxLine} className="min-w-36">
            Log in
          </Button>
          <ButtonLink href="/dashboard" onClick={navigateWithFade} trailingIcon={RiArrowRightLine} className="min-w-36">
            Masuk ke Platform
          </ButtonLink>
        </div>
      </section>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setTimeout(() => {
            window.history.pushState({}, "", "/dashboard");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }, 200);
        }}
      />
    </main>
  );
}
