import { useState } from "react";
import { toast } from "sonner";
import { AgentChat } from "@/components/application/agent-chat/agent-chat";
import { DashboardSidebar, type DashboardNavItem } from "@/components/application/dashboard/dashboard-sidebar";
import { useProfileSwitcher } from "@/hooks/use-profile-switcher";
import { useSession } from "@/hooks/use-session";
import { useDevices } from "../device-api";
import { NAVIGATION_ITEMS } from "../navigation";
import { JevReply } from "@/components/application/jev-chat/jev-reply";
import { JEV_THREADS_KEY } from "@/components/application/jev-chat/jev-storage";
import { JevThinking } from "@/components/application/jev-chat/jev-thinking";
import { jevMessageText, JevTransport } from "@/components/application/jev-chat/jev-transport";
import { JevEmptyState } from "./jev-empty-state";

const COPY = {
  emptyTitle: "Tanya Kodama",
  emptyDescription: "Kodama menjawab dari data wilayah, kejadian, dan peringatan Arkamap. Riwayat chat tersimpan di browser ini.",
  suggestions: [
    "Wilayah mana yang paling perlu perhatian?",
    "Ringkas peringatan aktif hari ini",
    "Kejadian apa saja di Riau minggu ini?",
  ],
  thinkingLabel: "Kodama sedang berpikir",
  newChat: "Chat baru",
  placeholder: "Tanyakan apa saja ke Kodama",
  provider: "Jev",
  error: (error: Error) => error.message || "Kodama tidak tersedia. Coba lagi beberapa saat lagi.",
  showHistory: "Tampilkan riwayat chat",
  hideHistory: "Sembunyikan riwayat chat",
};

function navigate(id: string) {
  window.location.assign(id === "sensors" ? "/devices" : "/dashboard");
}

/** The Kodama page: the BoardUI chat starter answering through the Jev model. */
export function JevChat() {
  const [transport] = useState(() => new JevTransport());
  // Set by the side panel's "Buka halaman penuh", so the same thread opens here.
  const [initialThreadId] = useState(() => new URLSearchParams(window.location.search).get("thread") ?? undefined);
  const session = useSession();
  const profileSwitcher = useProfileSwitcher();
  const { devices } = useDevices();
  const items: DashboardNavItem[] = NAVIGATION_ITEMS.map(item => ({
    key: item.id,
    label: item.label,
    icon: item.icon,
    href: item.href,
    section: item.section,
    badge: item.id === "sensors" ? String(devices.length) : item.badge,
    onClick: item.href ? undefined : () => navigate(item.id),
  }));

  return <AgentChat
    transport={transport}
    storageKey={JEV_THREADS_KEY}
    initialThreadId={initialThreadId}
    voiceLanguage="id-ID"
    copy={COPY}
    getText={jevMessageText}
    renderThinking={messages => <JevThinking messages={messages} />}
    renderEmpty={onPick => <JevEmptyState name={session.me?.user.name} onPick={onPick} />}
    // A soft brand wash under the card's top edge. It belongs to the scroll box, so it stays put while messages scroll.
    transcriptClassName="bg-linear-to-b from-accent-100/70 to-transparent to-45% dark:from-accent-500/12"
    renderAssistant={(message, streaming) => <JevReply message={message} streaming={streaming} />}
    renderSidebar={({ mobile, onClose }) => <DashboardSidebar
      mobile={mobile}
      onClose={onClose}
      items={items}
      selected="superintelligence"
      identity={{ name: session.me?.user.name ?? "Pengunjung", role: session.me?.profile?.role ?? "Map publik" }}
      onAccountAction={label => {
        if (label === "Keluar" && session.me) void session.logout().catch(cause => toast.error(cause.message));
        else window.dispatchEvent(new Event("arkamap-profile-open"));
      }}
      profiles={profileSwitcher.options}
      onProfileSelect={profileSwitcher.select}
      maxProfiles={profileSwitcher.maxProfiles}
      className="h-full"
    />}
  />;
}
