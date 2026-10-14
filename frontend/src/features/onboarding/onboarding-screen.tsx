import { useState } from "react";
import { ArkamapLockup } from "@/components/foundations/brand/arkamap-brand";
import { Dialog } from "@base-ui/react/dialog";
import { RiUserLine, RiMapPinLine, RiDashboardLine, RiCheckLine, RiArrowRightLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { notifySession } from "@/hooks/use-session";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import background from "@/assets/login-page.webp";
import { KenalanForm } from "./kenalan-form";

const steps = [
  { title: "Peran Dan Tujuan", description: "Ceritakan kebutuhan pantauan Anda.", icon: RiUserLine },
  { title: "Wilayah Dan Mode", description: "Tentukan fokus pantauan Anda.", icon: RiMapPinLine },
  { title: "Pantauan Anda", description: "Lihat hasil pemetaan profil Anda.", icon: RiDashboardLine },
] as const;

function navigate(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function OnboardingScreen({ me, loading, error, onLogout }: { me?: DTO<"MeOut">; loading: boolean; error?: string; onLogout: () => Promise<void> }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<DTO<"ProfileOut">>();
  const [logoutError, setLogoutError] = useState<string>();
  const activeStep = saved ? 2 : step;
  const profileCount = me?.profiles?.length ?? (me?.profile ? 1 : 0);
  const maxProfiles = me?.max_profiles ?? 3;
  const limitReached = profileCount >= maxProfiles;

  return <main className="relative min-h-dvh bg-background-full">
    <img src={background} alt="" className="fixed inset-0 h-full w-full object-cover" />
    <div className="fixed inset-0 bg-background-full/30 dark:bg-background-full/65" />
    <Dialog.Root open disablePointerDismissal onOpenChange={(_, details) => details.cancel()}>
      <Dialog.Portal>
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
          <Dialog.Popup className="relative grid max-h-[calc(100dvh-24px)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border-button-default bg-background-primary-default text-text-primary shadow-xl outline-none md:grid-cols-[0.58fr_0.42fr] md:max-h-[calc(100dvh-48px)]">
            <section className="order-2 flex min-w-0 flex-col bg-background-secondary-default px-5 py-6 sm:px-8 md:order-1 md:min-h-[580px] md:px-10 md:py-8">
              {loading ? <p role="status" className="text-body-regular text-text-secondary">Memuat Profil Pantauan...</p> : !me ? <div className="my-auto"><h2 className="text-heading-xl">Masuk Untuk Melanjutkan</h2><p className="mt-3 text-body-regular text-text-secondary">Sesi belum tersedia. Masuk kembali untuk menyimpan profil pantauan Anda.</p>{error && <p role="alert" className="mt-3 text-body-regular text-text-error-primary">{error}</p>}<div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => navigate("/login")}>Masuk</Button><Button variant="secondary" onClick={notifySession}>Coba Lagi</Button></div></div> : limitReached ? <div className="my-auto"><h2 className="text-heading-xl">Batas Profil Tercapai</h2><p className="mt-3 text-body-regular text-text-secondary">Akun Anda sudah memiliki batas maksimal {maxProfiles} profil pantauan. Hapus salah satu profil terlebih dahulu di Pengaturan, bagian Profil pantauan (menu akun di sidebar), untuk membuat profil baru.</p><div className="mt-6"><Button onClick={() => navigate("/dashboard")}>Kembali Ke Dashboard</Button></div></div> : saved ? <>
                <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-border-button-default bg-background-primary-default text-accent-600 dark:text-accent-400"><RiCheckLine className="size-6" /></div>
                <h2 className="text-heading-xl">Profil Pantauan Siap</h2>
                <p className="mt-2 text-body-regular text-text-secondary">Berikut hasil pemetaan dari profil yang Anda simpan.</p>
                <dl className="mt-6 grid gap-4 rounded-2xl border border-border-button-default bg-background-primary-default p-5 text-body-regular">
                  <div><dt className="text-text-secondary">Peran</dt><dd className="mt-1 font-medium">{saved.role}</dd></div>
                  <div><dt className="text-text-secondary">Wilayah</dt><dd className="mt-1">{saved.region_name ?? "Seluruh Indonesia"}</dd></div>
                  <div><dt className="text-text-secondary">Mode Pantauan</dt><dd className="mt-1">{saved.mode_label}</dd><dd className="mt-1 text-caption-1 text-text-secondary">{saved.mode_by === "user" ? "Pilihan Anda" : saved.mode_by === "ai" ? "Dipetakan oleh AI" : "Dipetakan berdasarkan aturan"}</dd></div>
                </dl>
                {saved.ai_message && <p className="mt-4 text-body-regular text-text-secondary">{saved.ai_message}</p>}
                {Boolean(saved.unsupported?.length) && <div className="mt-4 text-body-regular"><h3 className="font-medium">Kebutuhan Yang Belum Didukung</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">{saved.unsupported?.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                <Button trailingIcon={RiArrowRightLine} className="mt-6 self-end" onClick={() => { notifySession(); navigate("/dashboard"); }}>Masuk Ke Dashboard</Button>
              </> : <>
                <div className="mb-6"><p className="mb-2 text-caption-1 text-text-secondary">Langkah {step + 1} Dari 2</p><h2 className="text-heading-xl">{steps[step].title}</h2><p className="mt-2 text-body-regular text-text-secondary">{step === 0 ? "Apa peran Anda dan apa yang ingin Anda pahami?" : "Pilih wilayah minat dan cara Anda ingin memantau data."}</p></div>
                <KenalanForm firstProfile={!me.profile} step={step} onStepChange={setStep} onBusyChange={setBusy} onSaved={result => setSaved(result.profile ?? undefined)} />
              </>}
              {me && <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">{me.profile ? <Button variant="secondary" size="small" disabled={busy} onClick={() => navigate("/dashboard")}>Kembali Ke Dashboard</Button> : <div />}{logoutError && <p role="alert" className="w-full text-body-regular text-text-error-primary">{logoutError}</p>}<Button variant="ghost" size="small" disabled={busy} onClick={() => { setBusy(true); void onLogout().then(() => navigate("/login")).catch(cause => setLogoutError(cause instanceof Error ? cause.message : "Gagal keluar dari akun.")).finally(() => setBusy(false)); }}>Keluar Dari Akun</Button></div>}
            </section>
            <aside className="order-1 flex flex-col border-b border-separator-border md:order-2 md:border-b-0 md:border-l">
              <div className="flex items-center border-b border-separator-border px-5 py-5 sm:px-8"><ArkamapLockup /></div>
              <div className="px-5 pt-6 sm:px-8 md:pt-8">
                <Dialog.Title className="text-heading-xl">{!me?.profile ? `Selamat Datang Di Arkamap${me ? `, ${me.user.name}.` : "."}` : `Tambah Profil Pantauan, ${me.user.name}.`}</Dialog.Title>
                <Dialog.Description className="mt-2 text-body-regular text-text-secondary">{!me?.profile ? "Siapkan profil pantauan sebelum masuk ke dashboard. Kami akan menyesuaikan indikator dengan kebutuhan Anda." : `Buat profil pantauan baru (profil ke-${profileCount + 1} dari ${maxProfiles}) untuk kebutuhan atau wilayah lainnya.`}</Dialog.Description>
              </div>
              <nav aria-label="Tahap onboarding" className="flex gap-2 px-5 py-5 sm:px-8 md:flex-col md:gap-3 md:py-8">
                {steps.map((item, index) => <Button key={item.title} aria-label={item.title} variant="ghost" disabled={busy || !me || Boolean(saved) || index > step} aria-current={index === activeStep ? "step" : undefined}
                  onClick={() => { if (index < 2) setStep(index as 0 | 1); }}
                  className={cx("h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-xl p-3 text-left md:flex-none", index === activeStep && "bg-background-primary-active ring-1 ring-border-button-default") }>
                  <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-button-default", index === activeStep ? "text-accent-600 dark:text-accent-400" : "text-text-secondary")}><item.icon className="size-5" /></span>
                  <span className="hidden min-w-0 sm:block"><span className="block text-body-medium">{item.title}</span><span className="mt-1 block text-caption-1 text-text-secondary">{item.description}</span></span>
                  <span className="text-caption-1 sm:hidden">{index + 1}</span>
                </Button>)}
              </nav>
              <p className="mt-auto hidden border-t border-separator-border px-8 py-5 text-caption-1 text-text-secondary md:block">Pemetaan AI membantu memilih data. Hasilnya bukan verifikasi identitas atau peringatan resmi.</p>
            </aside>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  </main>;
}
