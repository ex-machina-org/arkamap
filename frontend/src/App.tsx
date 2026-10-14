import { useSession } from "@/hooks/use-session";
import { goTo } from "@/lib/navigate";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SessionGate } from "@/components/application/auth/session-gate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToaster } from "@/components/ui/toaster";
import "./route-transition.css";

// /welcome draws a three.js scene: loaded only on its own route, never in every page's bundle
const LandingPage = lazy(() => import("./app/landing/page"));
// An annotation toolbar for development; production never downloads it.
const Agentation = import.meta.env.DEV ? lazy(() => import("agentation").then(module => ({ default: module.Agentation }))) : null;
const DesignSystemPage = lazy(() => import("./app/design-system/page"));
const EnvironmentalDashboardPage = lazy(() => import("./app/dashboard/page"));
const LoginPage = lazy(() => import("./app/login/page"));
const AddDevicePage = lazy(() => import("./app/devices/new/page"));
const TestDevicePage = lazy(() => import("./app/devices/test/page"));
const DevicesPage = lazy(() => import("./app/devices/page"));
const SourcesPage = lazy(() => import("./app/sources/page"));
const AlertsPage = lazy(() => import("./app/alerts/page"));
const DeviceDetailPage = lazy(() => import("./app/devices/detail/page"));
const MapPage = lazy(() => import("./app/map/page"));
const AnalysisPage = lazy(() => import("./app/analisis/page"));
const ChatPage = lazy(() => import("./app/chat/page"));

// Signed-out visitors may only use the public map; every workspace route needs a session.
function isProtectedPath(path: string) {
  return path === "/dashboard" || path === "/app-shell" || path === "/chat" || path === "/devices" || path.startsWith("/devices/") || path === "/sources" || path === "/alerts";
}


export default function App() {
  const session = useSession();
  // A plain link to another page of this app is followed without a page load, so the
  // signed-in profile stays in memory instead of being fetched again on every menu click.
  useEffect(() => {
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      // the API and its docs are served by the backend, not by this app
      if (url.origin !== window.location.origin || /^\/(api|docs)(\/|$)/.test(url.pathname) || (url.hash && url.pathname === window.location.pathname)) return;
      event.preventDefault();
      goTo(url.pathname + url.search);
    };
    document.addEventListener("click", follow);
    return () => document.removeEventListener("click", follow);
  }, []);
  useEffect(() => {
    const open = () => {
      window.history.pushState({}, "", "/onboarding");
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    window.addEventListener("arkamap-profile-open", open);
    return () => {
      window.removeEventListener("arkamap-profile-open", open);
    };
  }, []);
  const [currentPath, setCurrentPath] = useState(
    () => window.location.pathname.replace(/\/$/, "") || "/"
  );
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    const handleLocationChange = () => {
      const nextPath = window.location.pathname.replace(/\/$/, "") || "/";
      setCurrentPath(nextPath);
      setArriving(true);
      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  useEffect(() => {
    if (!arriving) return;
    const timer = setTimeout(() => setArriving(false), 220);
    return () => clearTimeout(timer);
  }, [arriving]);

  const catalogRoute = currentPath === "/design-system" || currentPath.startsWith("/design-system/");
  const needsOnboarding = !catalogRoute && Boolean(session.me && !session.me.profile);
  const protectedRoute = isProtectedPath(currentPath);
  // A failed lookup is not proof of sign-out, so it gets a retry gate instead of a redirect.
  const blocked = protectedRoute && !session.loading && !session.me && !session.error;
  const routePath = blocked ? "/" : currentPath;
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (session.me) wasSignedIn.current = true;
  }, [session.me]);
  useEffect(() => {
    if (!blocked) return;
    window.history.replaceState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    // A deliberate sign-out needs no explanation.
    if (!wasSignedIn.current) toast.error("Masuk terlebih dahulu untuk mengakses dashboard.");
    wasSignedIn.current = false;
  }, [blocked]);
  useEffect(() => {
    if (needsOnboarding && currentPath !== "/onboarding") {
      window.history.replaceState({}, "", "/onboarding");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [currentPath, session.me, needsOnboarding]);

  return (
    <TooltipProvider>
      <AppToaster />
      <div className="route-page" data-arriving={arriving}>
        {routePath === "/onboarding" || needsOnboarding ? (
          <OnboardingScreen me={session.me} loading={session.loading} error={session.error} onLogout={session.logout} />
        ) : protectedRoute && session.loading ? (
          <div className="flex min-h-dvh items-center justify-center bg-background-full text-text-secondary" role="status">Memuat Profil Pantauan...</div>
        ) : protectedRoute && !session.me && session.error ? (
          <SessionGate error={session.error} onRetry={() => void session.reload()} onLeave={() => goTo("/")} />
        ) : routePath === "/" || routePath === "/map" || routePath === "/siri-map" || routePath === "/atlas" || routePath === "/map-ai" || routePath === "/siri" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-full" />}><MapPage /></Suspense>
        ) : routePath === "/analisis" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-full" />}><AnalysisPage /></Suspense>
        ) : routePath === "/design-system" || routePath.startsWith("/design-system/") ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><DesignSystemPage /></Suspense>
        ) : routePath === "/devices/new" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><AddDevicePage /></Suspense>
        ) : routePath === "/devices/test" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><TestDevicePage /></Suspense>
        ) : /^\/devices\/\d+$/.test(routePath) ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><DeviceDetailPage id={Number(routePath.slice("/devices/".length))} /></Suspense>
        ) : routePath === "/devices" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><DevicesPage /></Suspense>
        ) : routePath === "/sources" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><SourcesPage /></Suspense>
        ) : routePath === "/alerts" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><AlertsPage /></Suspense>
        ) : routePath === "/dashboard" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><EnvironmentalDashboardPage /></Suspense>
        ) : routePath === "/chat" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-full" />}><ChatPage /></Suspense>
        ) : routePath === "/app-shell" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><EnvironmentalDashboardPage /></Suspense>
        ) : routePath === "/login" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-primary-default" />}><LoginPage /></Suspense>
        ) : routePath === "/welcome" ? (
          <Suspense fallback={<div className="min-h-dvh bg-background-full" />}><LandingPage /></Suspense>
        ) : (
          <Suspense fallback={<div className="min-h-dvh bg-background-full" />}><MapPage /></Suspense>
        )}
      </div>
      {Agentation && <Suspense fallback={null}><Agentation /></Suspense>}
    </TooltipProvider>
  );
}
