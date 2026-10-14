import { useEffect, useState } from "react";
import { RiArrowLeftLine, RiCommandLine, RiLoginBoxLine, RiMoonLine, RiSearchLine, RiSunLine } from "@remixicon/react";
import { ArkamapLogo } from "@/components/foundations/brand/logo";
import { CatalogExportActions } from "./export-actions";
import { CommandMenu } from "@/components/ui/command";
import { LoginModal } from "@/components/application/auth/login-modal";
import { DocContent } from "./content";
import { ComponentDoc } from "./docs-ui";
import { docs, groups, hrefFor, sectionsFor } from "./registry";

export default function DesignSystemPage() {
  const slug = window.location.pathname.replace(/\/$/, "").replace(/^\/design-system\/?/, "");
  const active = docs.find(item => item.slug === slug);
  const [commandOpen, setCommandOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const visible = docs;

  useEffect(() => {
    document.title = `${active?.title ?? "Not found"} · Arkamap Design System`;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(open => !open); }
    };
    const onOpenCommand = () => setCommandOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("joints:open-command", onOpenCommand);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("joints:open-command", onOpenCommand); };
  }, [active?.title]);

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.classList.toggle("dark", nextDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextDark ? "#242424" : "#ffffff");
    try { localStorage.setItem("joints-theme", nextDark ? "dark" : "light"); } catch { /* Theme still changes for this page. */ }
    setDark(nextDark);
  }

  return <div className="min-h-dvh bg-background-primary-default text-text-primary">
    <header className="sticky top-0 z-40 h-14 border-b border-border-button-default bg-background-primary-default/95 backdrop-blur-md">
      <div className="relative mx-auto flex h-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
        <a href="/design-system" className="z-10 flex min-w-0 items-center gap-2.5" aria-label="Arkamap Design System overview">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-background-secondary-default p-1 text-text-primary shadow-xs">
            <ArkamapLogo size={20} />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Arkamap <span className="font-normal text-text-secondary">Design System</span></span>
        </a>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <button type="button" onClick={() => setCommandOpen(true)} className="pointer-events-auto group relative flex h-9 w-full max-w-[360px] items-center gap-2 rounded-[9px] border border-border-button-default bg-background-secondary-default px-3 text-left text-sm text-text-secondary shadow-xs outline-none transition-all duration-150 hover:border-accent-300 hover:bg-background-primary-default hover:text-text-primary active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent-500">
            <RiSearchLine className="size-4 transition-transform duration-150 group-hover:scale-110" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Search components...</span>
            <span className="hidden items-center gap-0.5 rounded border border-border-button-default px-1.5 py-0.5 text-[10px] transition-colors group-hover:border-border-button-hover sm:flex"><RiCommandLine className="size-3" />K</span>
          </button>
        </div>

        <div className="z-10 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 text-sm font-medium text-text-secondary shadow-xs outline-none transition-all duration-150 hover:border-accent-300 hover:text-text-primary active:scale-95 focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <RiLoginBoxLine className="size-4" />
            <span>Log in</span>
          </button>
          <a href="/prototype" className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-background-primary-hover hover:text-text-primary active:scale-95 md:flex"><RiArrowLeftLine className="size-4" />Prototype</a>
          <button type="button" onClick={toggleTheme} className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default text-text-secondary shadow-xs outline-none transition-all duration-150 hover:text-text-primary active:scale-95 focus-visible:ring-2 focus-visible:ring-accent-500" aria-label={dark ? "Use light theme" : "Use dark theme"}>{dark ? <RiSunLine className="size-4" /> : <RiMoonLine className="size-4" />}</button>
        </div>
      </div>
    </header>

    <div className="mx-auto flex max-w-[1600px]">
      <aside className="sticky top-14 hidden h-[calc(100dvh-56px)] w-[220px] shrink-0 overflow-y-auto border-r border-border-button-default px-3 pb-8 pt-7 md:block lg:w-[236px]" aria-label="Design system navigation">
        {groups.map(group => { const items = visible.filter(item => item.group === group).sort((a, b) => a.slug === "" ? -1 : b.slug === "" ? 1 : a.title.localeCompare(b.title)); return items.length ? <div key={group} className="mb-7"><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.11em] text-text-tertiary">{group}</p><nav className="space-y-0.5" aria-label={group}>{items.map(item => <a key={item.slug} href={hrefFor(item.slug)} aria-current={item.slug === slug ? "page" : undefined} style={item.slug === slug ? { backgroundColor: "var(--color-button-ghost-background)", color: "var(--color-button-ghost-foreground)" } : undefined} className={`relative block rounded-[8px] px-3 py-2 text-[13px] outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent-500 ${item.slug === slug ? "font-semibold before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:bg-accent-500" : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary"}`}>{item.title}</a>)}</nav></div> : null; })}
        <div className="mt-8 border-t border-border-button-default px-3 pt-5"><p className="text-xs leading-5 text-text-tertiary">Components come from JOINTS and the local BoardUI source library.</p></div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-20 pt-7 sm:px-8 lg:px-10 lg:pt-10">
        <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-text-tertiary"><a href="/design-system" className="hover:text-text-primary">Design system</a><span>/</span><span>{active?.group ?? "Unknown"}</span><span>/</span><span className="text-text-secondary">{active?.title ?? "Not found"}</span></nav>
        {active && <CatalogExportActions entry={active} />}
        {active ? <ComponentDoc title={active.title} description={active.description} source={active.source} sections={sectionsFor(slug)}><DocContent slug={slug} /></ComponentDoc> : <div className="py-24 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-text-secondary">This design system page does not exist.</p><a href="/design-system" className="mt-5 inline-block text-sm font-medium text-accent-600">Return to overview</a></div>}
      </main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-border-button-default bg-background-primary-default/95 px-3 py-2 backdrop-blur-md md:hidden" aria-label="Mobile design system navigation">{visible.map(item => <a key={item.slug} href={hrefFor(item.slug)} aria-current={item.slug === slug ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${item.slug === slug ? "bg-button-primary font-semibold text-white" : "bg-background-secondary-default text-text-secondary"}`}>{item.title}</a>)}</nav>
    <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} actions={docs.map(item => ({ id: item.slug || "overview", label: item.title, group: item.group, keywords: item.description, onSelect: () => { window.location.href = hrefFor(item.slug); } }))} />
    <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
  </div>;
}
