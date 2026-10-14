import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Combobox } from "@/components/ui/combobox";
import { api, apiList, jsonBody, type DTO } from "@/lib/api/client";
import { notifySession } from "@/hooks/use-session";

type Props = {
  onSaved?: (me: DTO<"MeOut">) => void;
  firstProfile?: boolean;
  step?: 0 | 1;
  onStepChange?: (step: 0 | 1) => void;
  onBusyChange?: (busy: boolean) => void;
};

type RegionScope = "national" | "provinsi" | "kabkota";

export function KenalanForm({ onSaved, firstProfile = false, step, onStepChange, onBusyChange }: Props) {
  const [modes, setModes] = useState<DTO<"ModeInfo">[]>([]);
  const [modeError, setModeError] = useState(false);
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState("");

  // Scope selection: dropdown with 3 options
  const [scope, setScope] = useState<RegionScope>("national");

  // Region data from backend
  const [provinces, setProvinces] = useState<DTO<"RegionRef">[]>([]);
  const [allKabkotas, setAllKabkotas] = useState<DTO<"RegionRef">[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(true);

  const [selectedProvinceId, setSelectedProvinceId] = useState<string>();
  const [selectedKabkotaId, setSelectedKabkotaId] = useState<string>();

  const [mode, setMode] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Fetch modes
  useEffect(() => {
    const controller = new AbortController();
    apiList("/modes", "ModeInfo", { signal: controller.signal })
      .then(setModes)
      .catch(() => { if (!controller.signal.aborted) setModeError(true); });
    return () => controller.abort();
  }, []);

  // Fetch provinces and kabupaten/kota on mount
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiList("/regions?level=provinsi&limit=100", "RegionRef", { signal: controller.signal }),
      apiList("/regions?level=kabkota&limit=600", "RegionRef", { signal: controller.signal }),
    ])
      .then(([provs, kabkotas]) => {
        setProvinces(provs);
        setAllKabkotas(kabkotas);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRegions(false);
      });
    return () => controller.abort();
  }, []);

  // Map of province ID -> province Name
  const provinceMap = useMemo(() => {
    return new Map(provinces.map(p => [p.id, p.name]));
  }, [provinces]);

  const provinceOptions = useMemo(
    () => provinces.map(p => ({ value: p.id, label: p.name })),
    [provinces],
  );

  // Grouped under their province heading; groups are contiguous so the heading order stays stable
  const kabkotaOptions = useMemo(
    () =>
      allKabkotas
        .map(k => ({ value: k.id, label: k.name, group: provinceMap.get(k.parent_id ?? "") || "Lainnya" }))
        .sort((a, b) => a.group.localeCompare(b.group)),
    [allKabkotas, provinceMap],
  );

  function handleScopeChange(newScope: RegionScope) {
    setScope(newScope);
    setError(undefined);
  }

  // Determine active region_id for API submission
  const activeRegionId =
    scope === "national"
      ? undefined
      : scope === "provinsi"
        ? selectedProvinceId
        : selectedKabkotaId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (role.trim().length < 2) {
      setError("Tuliskan peran Anda, minimal dua karakter.");
      onStepChange?.(0);
      return;
    }

    if (step === 0) {
      setError(undefined);
      onStepChange?.(1);
      return;
    }

    // Validation for step 1
    if (scope === "provinsi" && !selectedProvinceId) {
      setError("Silakan pilih salah satu provinsi.");
      return;
    }
    if (scope === "kabkota" && !selectedKabkotaId) {
      setError("Silakan pilih salah satu kabupaten atau kota.");
      return;
    }

    setError(undefined);
    setBusy(true);
    onBusyChange?.(true);

    try {
      const me = await api(firstProfile ? "/me/profile" : "/me/profiles", "MeOut", {
        method: firstProfile ? "PUT" : "POST",
        ...jsonBody({
          role: role.trim(),
          goals: goals.trim() || null,
          region_id: activeRegionId ?? null,
          mode: mode === "auto" ? null : mode,
        }),
      });

      if (!me.profile) throw new Error("API belum mengembalikan profil aktif. Coba simpan kembali.");

      if (!firstProfile) notifySession();
      onSaved?.(me);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profil gagal disimpan.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={step === undefined ? "flex flex-col gap-4 rounded-xl border border-border-button-default bg-background-primary-default p-4" : "flex flex-col gap-5"}
    >
      {step === undefined && (
        <>
          <h2 className="text-heading-lg text-text-primary">Kenalan</h2>
          <p className="text-body-regular text-text-secondary">
            Ceritakan peran dan kebutuhan pantauan Anda. Hasil pemetaan AI bukan verifikasi identitas.
          </p>
        </>
      )}

      {/* STEP 1: PERAN & TUJUAN */}
      {(step === undefined || step === 0) && (
        <>
          <Input
            label="Peran / Pekerjaan"
            name="role"
            value={role}
            onChange={setRole}
            isRequired
            minLength={2}
            maxLength={200}
            validationBehavior="native"
            placeholder="Misalnya, anggota damkar atau peneliti lingkungan"
            isDisabled={busy}
          />
          <Input
            label="Tujuan Pantauan"
            name="goals"
            value={goals}
            onChange={setGoals}
            maxLength={500}
            placeholder="Apa yang ingin Anda pantau? (opsional)"
            isDisabled={busy}
          />
          {step === 0 && (
            <p className="text-caption-1 text-text-secondary">
              Gunakan penjelasan Anda sendiri. Arkamap akan memetakan kebutuhan tersebut ke data yang tersedia.
            </p>
          )}
        </>
      )}

      {/* STEP 2: WILAYAH & MODE */}
      {(step === undefined || step === 1) && (
        <>
          {/* 1. DROPDOWN CAKUPAN WILAYAH */}
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium font-medium text-text-primary">Cakupan Wilayah</span>
            <Select
              aria-label="Cakupan Wilayah"
              selectedKey={scope}
              onSelectionChange={(key) => handleScopeChange(String(key) as RegionScope)}
              isDisabled={busy}
            >
              <SelectItem id="national">Seluruh Indonesia</SelectItem>
              <SelectItem id="provinsi">Provinsi</SelectItem>
              <SelectItem id="kabkota">Kabupaten / Kota</SelectItem>
            </Select>
          </div>
          {scope === "provinsi" && (
            <Combobox
              label="Pilih Provinsi"
              options={provinceOptions}
              value={selectedProvinceId ?? ""}
              onChange={(id) => { setSelectedProvinceId(String(id)); setError(undefined); }}
              placeholder={loadingRegions ? "Memuat daftar provinsi..." : "Pilih salah satu provinsi..."}
              searchPlaceholder="Cari provinsi..."
              emptyText="Tidak ada provinsi yang cocok."
              disabled={busy || loadingRegions}
            />
          )}

          {scope === "kabkota" && (
            <Combobox
              label="Pilih Kabupaten / Kota"
              options={kabkotaOptions}
              value={selectedKabkotaId ?? ""}
              onChange={(id) => { setSelectedKabkotaId(String(id)); setError(undefined); }}
              placeholder={loadingRegions ? "Memuat data kabupaten/kota..." : "Pilih salah satu kabupaten / kota..."}
              searchPlaceholder="Cari kabupaten atau kota..."
              emptyText="Tidak ada kabupaten/kota yang cocok."
              disabled={busy || loadingRegions}
            />
          )}
          {/* 4. MODE PANTAUAN */}
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium font-medium text-text-primary">Mode Pantauan</span>
            <Select aria-label="Mode pantauan" selectedKey={mode} onSelectionChange={(key) => setMode(String(key))} isDisabled={busy}>
              <SelectItem id="auto">Pilih otomatis dari peran (Rekomendasi AI)</SelectItem>
              {modes.map((item) => (
                <SelectItem key={item.id} id={item.id}>
                  {item.label} ({item.title})
                </SelectItem>
              ))}
            </Select>
          </div>
          {modeError && (
            <p role="status" className="text-caption-1 text-text-secondary">
              Daftar mode belum dapat dimuat. Anda tetap bisa memakai pemilihan otomatis.
            </p>
          )}

          {step === 1 && (
            <p className="rounded-xl bg-background-supporting-default p-3 text-body-regular text-text-secondary">
              Profil: <span className="font-medium text-text-primary">{role}</span>
              {goals && <> · {goals}</>}
            </p>
          )}
        </>
      )}

      {error && <p role="alert" className="text-body-regular text-text-error-primary">{error}</p>}

      <div className="mt-2 flex flex-wrap justify-end gap-3">
        {step === 1 && (
          <Button variant="secondary" disabled={busy} onClick={() => onStepChange?.(0)}>
            Kembali
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? "Memetakan Profil..."
            : step === 0
              ? "Lanjutkan"
              : firstProfile
                ? "Siapkan Pantauan Saya"
                : "Simpan Profil Baru"}
        </Button>
      </div>
    </form>
  );
}
