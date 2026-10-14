import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TextArea, TextField } from "react-aria-components";
import { RiArrowLeftLine, RiArrowRightLine, RiCloseLine, RiLogoutBoxRLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { RadioGroup } from "@/components/base/radio/radio";
import { RadioCard } from "@/components/base/radio/radio-card";
import { Combobox } from "@/components/ui/combobox";
import { notifySession } from "@/hooks/use-session";
import { api, apiList, jsonBody, type DTO } from "@/lib/api/client";
import { spring } from "@/lib/springs";
import { goTo } from "@/lib/navigate";
import { cx } from "@/utils/cx";
import { ModeOptions } from "./mode-options";
import { ProfileDraftCard, type ModeChoice } from "./profile-draft-card";
import { ProfileStage } from "./profile-stage";
import { navigateWithMorph } from "./profile-transition";

type Scope = "national" | "provinsi" | "kabkota";
type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { title: "Ceritakan Peran Anda", description: "Peran membantu Arkamap memilih data yang relevan. Tulis dengan kata-kata Anda sendiri." },
  { title: "Masalah Yang Ingin Anda Atasi", description: "Ceritakan masalah yang Anda hadapi. Arkamap mencari data yang membantu menjawabnya, dan menyebut terus terang bila datanya belum ada." },
  { title: "Lokasi Masalah", description: "Dashboard memantau wilayah ini: kejadian, peringatan, dan perbandingan antardaerah mengikuti lokasi yang Anda pilih." },
  { title: "Pilih Mode Pantauan", description: "Mode mengatur rentang waktu dan urutan panel di dashboard. Pilih sendiri, atau serahkan pilihannya ke AI." },
] as const;

const ROLE_EXAMPLES = ["Anggota damkar", "Relawan bencana", "Peneliti lingkungan", "Petani", "Perencana daerah", "Petugas BPBD"];
// Most specific first: a problem usually happens somewhere particular.
const SCOPES: { id: Scope; title: string; description: string }[] = [
  { id: "kabkota", title: "Kabupaten/Kota", description: "Paling rinci, untuk masalah di satu daerah." },
  { id: "provinsi", title: "Provinsi", description: "Membandingkan kabupaten dan kota dalam satu provinsi." },
  { id: "national", title: "Seluruh Indonesia", description: "Gambaran nasional tanpa fokus wilayah." },
];
const PROBLEM_EXAMPLES = ["Kebakaran hutan dan lahan", "Banjir dan sungai meluap", "Kualitas udara memburuk", "Gempa bumi dan tsunami", "Kekeringan dan krisis air", "Cuaca panas ekstrem"];

function Chip({ pressed, onPress, children, disabled }: { pressed?: boolean; onPress: () => void; children: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onPress}
      className={cx("h-8 cursor-pointer rounded-full border px-3 text-body-2-regular transition-colors outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-full disabled:cursor-not-allowed disabled:opacity-50",
        pressed ? "border-accent-500 bg-background-primary-default text-text-primary" : "border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:text-text-primary")}>
      {children}
    </button>
  );
}

/** Shown to an account without a profile, and when an account adds one from the picker. */
export function OnboardingScreen({ me, loading, error, onLogout }: { me?: DTO<"MeOut">; loading: boolean; error?: string; onLogout: () => Promise<void> }) {
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState(1);
  const [role, setRole] = useState("");
  const [problem, setProblem] = useState("");
  const [scope, setScope] = useState<Scope>();
  const [provinceId, setProvinceId] = useState<string>();
  const [kabkotaId, setKabkotaId] = useState<string>();
  const [mode, setMode] = useState<ModeChoice>();
  const [modes, setModes] = useState<DTO<"ModeInfo">[]>([]);
  const [provinces, setProvinces] = useState<DTO<"RegionRef">[]>([]);
  const [kabkotas, setKabkotas] = useState<DTO<"RegionRef">[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState<DTO<"ProfileOut">>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const hasProfile = Boolean(me?.profile);
  const profileCount = me?.profiles?.length ?? (me?.profile ? 1 : 0);
  const maxProfiles = me?.max_profiles ?? 3;
  // A stable seed until the server assigns an id, so editing the draft does not replay its artwork transition.
  const seed = 1000 + profileCount;

  useEffect(() => {
    const controller = new AbortController();
    apiList("/modes", "ModeInfo", { signal: controller.signal }).then(setModes).catch(() => {});
    Promise.all([
      apiList("/regions?level=provinsi&limit=100", "RegionRef", { signal: controller.signal }),
      apiList("/regions?level=kabkota&limit=600", "RegionRef", { signal: controller.signal }),
    ])
      .then(([nextProvinces, nextKabkotas]) => { setProvinces(nextProvinces); setKabkotas(nextKabkotas); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoadingRegions(false); });
    return () => controller.abort();
  }, []);

  // Moving between steps hands focus to the new heading, so screen readers announce where the user is.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, saved]);

  const provinceNames = useMemo(() => new Map(provinces.map(item => [item.id, item.name])), [provinces]);
  const provinceOptions = useMemo(() => provinces.map(item => ({ value: item.id, label: item.name })), [provinces]);
  // Grouped under their province; groups stay contiguous so headings keep a stable order.
  const kabkotaOptions = useMemo(() => kabkotas
    .map(item => ({ value: item.id, label: item.name, group: provinceNames.get(item.parent_id ?? "") || "Lainnya" }))
    .sort((a, b) => a.group.localeCompare(b.group)), [kabkotas, provinceNames]);

  const regionId = scope === "provinsi" ? provinceId : scope === "kabkota" ? kabkotaId : undefined;
  const regionName = !scope ? undefined : scope === "national" ? "Seluruh Indonesia"
    : (scope === "provinsi" ? provinceNames.get(provinceId ?? "") : kabkotas.find(item => item.id === kabkotaId)?.name);
  const modeLabel = mode === "auto" ? "Pilihan AI" : mode ? (modes.find(item => item.id === mode)?.label ?? undefined) : undefined;

  function go(next: Step) {
    setDirection(next > step ? 1 : -1);
    setFormError(undefined);
    setStep(next);
  }

  function toggleProblem(example: string) {
    const parts = problem.split(",").map(part => part.trim()).filter(Boolean);
    const next = parts.includes(example) ? parts.filter(part => part !== example) : [...parts, example];
    setProblem(next.join(", "));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step === 0) {
      if (role.trim().length < 2) return setFormError("Tuliskan peran Anda, minimal dua karakter.");
      return go(1);
    }
    if (step === 1) {
      if (problem.trim().length < 3) return setFormError("Ceritakan masalah yang ingin Anda atasi, atau pilih salah satu contoh.");
      return go(2);
    }
    if (step === 2) {
      if (!scope) return setFormError("Pilih cakupan lokasi masalah.");
      if (scope === "provinsi" && !provinceId) return setFormError("Pilih provinsi tempat masalah ini terjadi.");
      if (scope === "kabkota" && !kabkotaId) return setFormError("Pilih kabupaten atau kota tempat masalah ini terjadi.");
      return go(3);
    }
    if (!mode) return setFormError("Pilih salah satu mode, atau biarkan AI memilih.");
    setFormError(undefined);
    setBusy(true);
    try {
      const result = await api(hasProfile ? "/me/profiles" : "/me/profile", "MeOut", {
        method: hasProfile ? "POST" : "PUT",
        ...jsonBody({ role: role.trim(), goals: problem.trim(), region_id: regionId ?? null, mode: mode === "auto" ? null : mode }),
      });
      if (!result.profile) throw new Error("API belum mengembalikan profil aktif. Coba simpan kembali.");
      setSaved(result.profile);
      notifySession();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Profil gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  const actions = !me ? undefined : hasProfile && !saved ? (
    <Button variant="ghost" size="small" leadingIcon={RiCloseLine} disabled={busy} onClick={() => navigateWithMorph("/profiles")}>Batal</Button>
  ) : !hasProfile && !saved ? (
    <Button variant="ghost" size="small" leadingIcon={RiLogoutBoxRLine} disabled={busy} onClick={() => void onLogout().then(() => goTo("/login")).catch(cause => setFormError(cause instanceof Error ? cause.message : "Gagal keluar dari akun."))}>Keluar</Button>
  ) : undefined;

  const notice = (title: string, body: string, action: ReactNode, alert?: string) => (
    <section className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-24 sm:px-8">
      <h1 className="text-title-1-semibold">{title}</h1>
      <p className="mt-3 text-headline-regular text-pretty text-text-secondary">{body}</p>
      {alert && <p role="alert" className="mt-3 text-body-regular text-text-error-primary">{alert}</p>}
      <div className="mt-6 flex flex-wrap gap-3">{action}</div>
    </section>
  );

  if (loading) return <ProfileStage><p role="status" className="m-auto pb-24 text-body-regular text-text-secondary">Memuat profil pantauan...</p></ProfileStage>;
  if (!me) return <ProfileStage>{notice("Masuk Untuk Melanjutkan", "Sesi belum tersedia. Masuk kembali untuk menyimpan profil pantauan Anda.", <><Button onClick={() => goTo("/login")}>Masuk</Button><Button variant="secondary" onClick={notifySession}>Coba Lagi</Button></>, error)}</ProfileStage>;
  if (!saved && profileCount >= maxProfiles) return <ProfileStage actions={actions}>{notice("Batas Profil Tercapai", `Akun Anda sudah memiliki ${maxProfiles} profil pantauan. Hapus salah satu lewat Kelola Profil untuk membuat profil baru.`, <Button onClick={() => navigateWithMorph("/profiles")}>Kembali Ke Pilihan Profil</Button>)}</ProfileStage>;

  const card = saved
    ? { seed: saved.id, mode: saved.mode as ModeChoice, modeLabel: saved.mode_label, role: saved.role, region: saved.region_name ?? "Seluruh Indonesia" }
    : { seed, mode, modeLabel, role: role.trim(), region: regionName };

  return (
    <ProfileStage actions={actions}>
      <div className="relative mx-auto grid w-full max-w-5xl flex-1 content-center gap-8 px-4 pb-24 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
        <div className="lg:hidden"><ProfileDraftCard compact {...card} /></div>

        <section aria-labelledby="onboarding-title" className="min-w-0">
          {saved ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.slow}>
              <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="text-title-1-semibold outline-none sm:text-display-4-semibold">Profil Siap Dipakai</h1>
              <p className="mt-3 max-w-xl text-headline-regular text-pretty text-text-secondary">
                {saved.mode_by === "user" ? "Mode pantauan sesuai pilihan Anda." : `AI memilih mode ${saved.mode_title} dari peran dan masalah Anda.`} Data di dashboard disesuaikan dengan profil ini.
              </p>
              <dl className="mt-8 grid max-w-xl gap-4 border-t border-separator-border pt-6 text-body-regular sm:grid-cols-2">
                <div><dt className="text-text-tertiary">Peran</dt><dd className="mt-1 text-text-primary">{saved.role}</dd></div>
                <div><dt className="text-text-tertiary">Wilayah</dt><dd className="mt-1 text-text-primary">{saved.region_name ?? "Seluruh Indonesia"}</dd></div>
                {saved.goals && <div className="sm:col-span-2"><dt className="text-text-tertiary">Masalah</dt><dd className="mt-1 text-text-primary">{saved.goals}</dd></div>}
                <div className="sm:col-span-2"><dt className="text-text-tertiary">Mode Pantauan</dt><dd className="mt-1 text-text-primary">{saved.mode_title} <span className="text-text-secondary">({saved.mode_by === "user" ? "pilihan Anda" : saved.mode_by === "ai" ? "dipilih AI" : "dipilih berdasarkan aturan"})</span></dd></div>
              </dl>
              {saved.ai_message && <p className="mt-6 max-w-xl rounded-xl bg-background-supporting-default p-3 text-body-regular text-pretty text-text-secondary">{saved.ai_message}</p>}
              {Boolean(saved.unsupported?.length) && (
                <div className="mt-6 max-w-xl text-body-regular">
                  <h2 className="text-body-medium text-text-primary">Belum Bisa Dijawab Dengan Data Kami</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">{saved.unsupported?.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Button trailingIcon={RiArrowRightLine} onClick={() => goTo("/dashboard")}>Buka Dashboard</Button>
                {hasProfile && <Button variant="secondary" onClick={() => navigateWithMorph("/profiles")}>Ke Pilihan Profil</Button>}
              </div>
            </motion.div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="flex items-center gap-3">
                <ol aria-label="Tahap pembuatan profil" className="flex gap-1.5">
                  {STEPS.map((item, index) => (
                    <li key={item.title} aria-current={index === step ? "step" : undefined}
                      className={cx("h-1 w-8 rounded-full transition-colors", index <= step ? "bg-accent-500" : "bg-background-tertiary-default")}>
                      <span className="sr-only">{item.title}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-caption-1 text-text-tertiary">Langkah {step + 1} dari {STEPS.length}</p>
              </div>

              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div key={step} custom={direction}
                  initial={{ opacity: 0, x: direction * 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -16, transition: spring.moderate.exit }}
                  transition={spring.moderate}>
                  <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="mt-5 text-title-1-semibold text-balance outline-none sm:text-display-4-semibold">{STEPS[step].title}</h1>
                  <p className="mt-3 max-w-xl text-headline-regular text-pretty text-text-secondary">{STEPS[step].description}</p>

                  <div className="mt-8 flex max-w-xl flex-col gap-6">
                    {step === 0 && (
                      <>
                        <Input label="Peran atau pekerjaan" name="role" value={role} onChange={value => { setRole(value); setFormError(undefined); }} isRequired maxLength={200}
                          placeholder="Misalnya, anggota damkar Kota Palangka Raya" isDisabled={busy} autoFocus />
                        <div role="group" aria-label="Contoh peran" className="flex flex-wrap gap-2">
                          {ROLE_EXAMPLES.map(example => <Chip key={example} pressed={role === example} onPress={() => { setRole(example); setFormError(undefined); }}>{example}</Chip>)}
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <TextField value={problem} onChange={value => { setProblem(value); setFormError(undefined); }} isRequired isDisabled={busy} maxLength={500} className="flex flex-col gap-1.5" autoFocus>
                          <Label isRequired>Masalah</Label>
                          <TextArea rows={3} placeholder="Misalnya, kebakaran lahan sering muncul saat kemarau dan asapnya sampai ke permukiman."
                            className="min-h-24 w-full resize-y rounded-2lg border border-border-input-default bg-background-primary-default px-3 py-2 text-body-regular text-text-primary shadow-xs outline-none placeholder:text-text-placeholder hover:border-border-button-hover focus:border-border-button-active focus:ring-2 focus:ring-inset focus:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-50" />
                        </TextField>
                        <div role="group" aria-label="Contoh masalah" className="flex flex-wrap gap-2">
                          {PROBLEM_EXAMPLES.map(example => <Chip key={example} pressed={problem.split(",").map(part => part.trim()).includes(example)} onPress={() => { toggleProblem(example); setFormError(undefined); }}>{example}</Chip>)}
                        </div>
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <RadioGroup aria-label="Cakupan lokasi" value={scope ?? null} isDisabled={busy} isInvalid={Boolean(formError) && !scope}
                          onChange={next => { setScope(next as Scope); setFormError(undefined); }}>
                          {SCOPES.map(item => <RadioCard key={item.id} value={item.id} title={item.title} description={item.description} />)}
                        </RadioGroup>
                        {scope === "provinsi" && (
                          <Combobox label="Provinsi" options={provinceOptions} value={provinceId ?? ""} onChange={id => { setProvinceId(String(id)); setFormError(undefined); }}
                            placeholder={loadingRegions ? "Memuat daftar provinsi..." : "Pilih provinsi"} searchPlaceholder="Cari provinsi..." emptyText="Tidak ada provinsi yang cocok." disabled={busy || loadingRegions} />
                        )}
                        {scope === "kabkota" && (
                          <Combobox label="Kabupaten/Kota" options={kabkotaOptions} value={kabkotaId ?? ""} onChange={id => { setKabkotaId(String(id)); setFormError(undefined); }}
                            placeholder={loadingRegions ? "Memuat daftar kabupaten/kota..." : "Pilih kabupaten atau kota"} searchPlaceholder="Cari kabupaten atau kota..." emptyText="Tidak ada kabupaten/kota yang cocok." disabled={busy || loadingRegions} />
                        )}
                      </>
                    )}

                    {step === 3 && <ModeOptions modes={modes} value={mode} onChange={next => { setMode(next); setFormError(undefined); }} disabled={busy} invalid={Boolean(formError) && !mode} />}
                  </div>
                </motion.div>
              </AnimatePresence>

              {formError && <p role="alert" className="mt-4 max-w-xl text-body-regular text-text-error-primary">{formError}</p>}

              <div className="mt-8 flex max-w-xl items-center justify-between gap-3">
                {step > 0 ? <Button variant="secondary" leadingIcon={RiArrowLeftLine} disabled={busy} onClick={() => go((step - 1) as Step)}>Kembali</Button> : <span />}
                <Button type="submit" disabled={busy} trailingIcon={step < 3 ? RiArrowRightLine : undefined}>
                  {busy ? (mode === "auto" ? "AI Sedang Memilih..." : "Menyimpan Profil...") : step < 3 ? "Lanjutkan" : "Simpan Profil"}
                </Button>
              </div>
            </form>
          )}
        </section>

        <aside aria-label="Pratinjau profil" className="hidden lg:block">
          <div className="sticky top-8 flex flex-col gap-4">
            <ProfileDraftCard {...card} />
            <p className="text-center text-caption-1 text-pretty text-text-tertiary">
              {saved ? "Kartu ini sudah muncul di halaman pilih profil." : "Kartu ini akan muncul di halaman pilih profil setelah disimpan."}
            </p>
          </div>
        </aside>
      </div>
      <p className="relative mx-auto max-w-5xl px-4 pb-6 text-center text-caption-1 text-pretty text-text-tertiary sm:px-8">Pemetaan AI membantu memilih data. Hasilnya bukan verifikasi identitas atau peringatan resmi.</p>
    </ProfileStage>
  );
}
