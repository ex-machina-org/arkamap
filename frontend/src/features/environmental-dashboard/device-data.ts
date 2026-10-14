export type DeviceKind = "awlr" | "peat_level" | "air_quality" | "water_quality" | "rainfall";
/** "other" covers sensors outside the five presets; its label is the owner's own text. */
export type DeviceKindChoice = DeviceKind | "other";
export type DeviceStatus = "online" | "offline" | "calibration";
export type DeviceOwnership = "institution" | "byod";

export interface IotDevice {
  backendId?: number;
  id: string;
  name: string;
  kind: DeviceKindChoice;
  /** Free-text type when `kind` is "other". */
  customKind?: string;
  ownership: DeviceOwnership;
  owner: string;
  location: string;
  province: string;
  status: DeviceStatus;
  /** Battery percentage; null for mains-powered units. */
  battery: number | null;
  lastSeen: string;
}

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  awlr: "Tinggi Muka Air",
  peat_level: "TMA Gambut",
  air_quality: "Kualitas Udara",
  water_quality: "Kualitas Air",
  rainfall: "Curah Hujan",
};

export function deviceKindLabel(device: Pick<IotDevice, "kind" | "customKind">) {
  return device.kind === "other" ? device.customKind || "Lainnya" : DEVICE_KIND_LABEL[device.kind];
}

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  calibration: "Kalibrasi",
};

// Fixture data for the dashboard preview; no device backend is connected.
export const INITIAL_DEVICES: IotDevice[] = [
  { id: "DEV-001", name: "AWLR Karangligar", kind: "awlr", ownership: "institution", owner: "BBWS Citarum", location: "Telukjambe Barat, Karawang", province: "Jawa Barat", status: "online", battery: null, lastSeen: "1 menit lalu" },
  { id: "DEV-002", name: "TMA Gambut Dayun", kind: "peat_level", ownership: "institution", owner: "BRGM", location: "Dayun, Siak", province: "Riau", status: "online", battery: 82, lastSeen: "3 menit lalu" },
  { id: "DEV-003", name: "ONLIMO Batujajar", kind: "water_quality", ownership: "institution", owner: "KLHK", location: "Batujajar, Bandung Barat", province: "Jawa Barat", status: "online", battery: null, lastSeen: "2 menit lalu" },
  { id: "DEV-004", name: "PM2.5 Marunda", kind: "air_quality", ownership: "institution", owner: "DLH DKI Jakarta", location: "Cilincing, Jakarta Utara", province: "DKI Jakarta", status: "calibration", battery: null, lastSeen: "12 menit lalu" },
  { id: "DEV-005", name: "Sensor PM2.5 Warga RW 04", kind: "air_quality", ownership: "byod", owner: "Komunitas Udara Bersih", location: "Tambun Selatan, Bekasi", province: "Jawa Barat", status: "online", battery: 64, lastSeen: "5 menit lalu" },
  { id: "DEV-006", name: "Pos Hujan Desa Rimbo", kind: "rainfall", ownership: "byod", owner: "Kelompok Tani Rimbo", location: "Rimbo Bujang, Tebo", province: "Jambi", status: "online", battery: 47, lastSeen: "8 menit lalu" },
  { id: "DEV-007", name: "TMA Gambut Kampar Kiri", kind: "peat_level", ownership: "byod", owner: "Masyarakat Peduli Api", location: "Kampar Kiri, Kampar", province: "Riau", status: "offline", battery: 9, lastSeen: "3 jam lalu" },
  { id: "DEV-008", name: "AWLR Sungai Kuranji", kind: "awlr", ownership: "institution", owner: "BPBD Kota Padang", location: "Kuranji, Padang", province: "Sumatera Barat", status: "online", battery: 91, lastSeen: "1 menit lalu" },
  { id: "DEV-009", name: "Sensor Kualitas Air Tambak", kind: "water_quality", ownership: "byod", owner: "Koperasi Tambak Pantura", location: "Indramayu Kota, Indramayu", province: "Jawa Barat", status: "calibration", battery: 73, lastSeen: "25 menit lalu" },
  { id: "DEV-010", name: "PM2.5 Sekolah SMPN 3", kind: "air_quality", ownership: "byod", owner: "SMPN 3 Palangka Raya", location: "Pahandut, Palangka Raya", province: "Kalimantan Tengah", status: "online", battery: null, lastSeen: "4 menit lalu" },
  { id: "DEV-011", name: "Pos Hujan Bukit Duri", kind: "rainfall", ownership: "institution", owner: "BMKG", location: "Tebet, Jakarta Selatan", province: "DKI Jakarta", status: "offline", battery: null, lastSeen: "1 jam lalu" },
  { id: "DEV-012", name: "TMA Gambut Pulang Pisau", kind: "peat_level", ownership: "institution", owner: "BRGM", location: "Kahayan Hilir, Pulang Pisau", province: "Kalimantan Tengah", status: "online", battery: 58, lastSeen: "6 menit lalu" },
];
