export type HazardType = "hotspot" | "flood" | "air_quality" | "seismic" | "iot_sensor";
export type ModeType = "responder" | "protect" | "plan";
export type UrgencyLevel = "critical" | "high" | "moderate" | "low";

export interface EnvironmentalIncident {
  id: string;
  title: string;
  location: string;
  province: string;
  coords: [number, number]; // [lng, lat]
  hazardType: HazardType;
  mode: ModeType;
  urgency: UrgencyLevel;
  urgencyScore: number;
  populationAtRisk: number;
  lastUpdated: string;
  source: string;
  confidence: number;
  status: "Belum Ditangani" | "Dalam Penanganan" | "Terverifikasi" | "Siaga";
  summary: string;
  evidence: {
    satellitePass?: string;
    sensorReading?: string;
    weatherCondition?: string;
    threatRadiusKm: number;
    criticalFacilities: string[];
  };
  recommendation: string;
}

export const INITIAL_INCIDENTS: EnvironmentalIncident[] = [
  {
    id: "inc-01",
    title: "Karhutla Gambut Siak",
    location: "Dayun, Siak",
    province: "Riau",
    coords: [101.9478, 0.7071],
    hazardType: "hotspot",
    mode: "responder",
    urgency: "critical",
    urgencyScore: 9.6,
    populationAtRisk: 42100,
    lastUpdated: "8m lalu",
    source: "VIIRS + Sentinel-2",
    confidence: 96,
    status: "Belum Ditangani",
    summary: "8 titik api pada gambut dalam (>2m). Buffer 2,8 km ke permukiman, asap pekat terdorong ke barat laut.",
    evidence: {
      satellitePass: "VIIRS Pass 02:15 WIB (368 K)",
      sensorReading: "TMA Gambut #04: -68 cm",
      weatherCondition: "Angin 18 km/j BD · RH 38%",
      threatRadiusKm: 3.5,
      criticalFacilities: ["Puskesmas Dayun", "3 Sekolah", "Kanal Sekat Daops"],
    },
    recommendation: "Pengerahan regu Manggala Agni Daops Siak & pembasahan kanal blok B.",
  },
  {
    id: "inc-02",
    title: "Banjir Luapan Citarum",
    location: "Karangligar, Karawang",
    province: "Jawa Barat",
    coords: [107.2815, -6.3145],
    hazardType: "flood",
    mode: "responder",
    urgency: "critical",
    urgencyScore: 9.3,
    populationAtRisk: 38500,
    lastUpdated: "14m lalu",
    source: "AWLR + Sentinel-1 SAR",
    confidence: 94,
    status: "Dalam Penanganan",
    summary: "TMA 185 cm (+35 cm Siaga 1). Jembatan logistik antardesa terendam arus 2,4 m/s; 420 KK terisolasi.",
    evidence: {
      satellitePass: "Sentinel-1 SAR (4.200 Ha)",
      sensorReading: "AWLR Karangligar: 185 cm (480 m³/s)",
      weatherCondition: "Hujan hulu 84 mm/hari",
      threatRadiusKm: 4.8,
      criticalFacilities: ["Jembatan Telukjambe", "Gardu PLN", "Posko Darurat"],
    },
    recommendation: "Alihkan rute via Lingkar Barat & terjunkan 3 perahu karet BPBD ke RT 03/04.",
  },
  {
    id: "inc-03",
    title: "Hotspot Gambut Kubu Raya",
    location: "Rasau Jaya, Kubu Raya",
    province: "Kalbar",
    coords: [109.3425, -0.1263],
    hazardType: "hotspot",
    mode: "responder",
    urgency: "high",
    urgencyScore: 8.7,
    populationAtRisk: 28400,
    lastUpdated: "25m lalu",
    source: "MODIS + AWS BMKG",
    confidence: 91,
    status: "Dalam Penanganan",
    summary: "6 hotspot aktif semak gambut. Asap memangkas jarak pandang Bandara Supadio hingga 1.800 m.",
    evidence: {
      satellitePass: "MODIS Aqua 01:40 WIB",
      sensorReading: "ISPU Pontianak: 165 (Tidak Sehat)",
      weatherCondition: "Angin 12 km/j Tenggara",
      threatRadiusKm: 5.2,
      criticalFacilities: ["Koridor Bandara Supadio", "Puskesmas Rasau"],
    },
    recommendation: "Water bombing BNPB perimeter bandara & rilis NOTAM kewaspadaan penerbangan.",
  },
  {
    id: "inc-04",
    title: "Anomali Emisi Marunda",
    location: "KBN Marunda, Cilincing",
    province: "DKI Jakarta",
    coords: [106.9656, -6.1056],
    hazardType: "air_quality",
    mode: "protect",
    urgency: "high",
    urgencyScore: 8.4,
    populationAtRisk: 54000,
    lastUpdated: "40m lalu",
    source: "SPKU KLHK + IoT Warga",
    confidence: 89,
    status: "Belum Ditangani",
    summary: "Lonjakan PM2.5 berulang tengah malam (23:00-04:00) hingga 174 µg/m³. Dugaan buangan cerobong tanpa filter.",
    evidence: {
      satellitePass: "Sentinel-5P TROPOMI NO2 Anomaly",
      sensorReading: "4 Node PM2.5: >160 µg/m³",
      weatherCondition: "Inversi suhu · Angin 4 km/j",
      threatRadiusKm: 2.5,
      criticalFacilities: ["Rusun Marunda", "SDN Marunda 02", "RPTRA Marunda"],
    },
    recommendation: "Sidak gabungan DLH Jakarta & Gakkum KLHK ke 3 pabrik peleburan logam.",
  },
  {
    id: "inc-05",
    title: "Banjir Pasang Rob Sayung",
    location: "Sayung, Demak",
    province: "Jawa Tengah",
    coords: [110.5185, -6.8944],
    hazardType: "flood",
    mode: "responder",
    urgency: "high",
    urgencyScore: 8.1,
    populationAtRisk: 19800,
    lastUpdated: "52m lalu",
    source: "Tide Gauge BMKG",
    confidence: 93,
    status: "Siaga",
    summary: "Pasang rob 65 cm merendam Jalan Pantura km 12. Antrean armada logistik 5,8 km.",
    evidence: {
      satellitePass: "Sentinel-1 Flood Mask",
      sensorReading: "Tide Sayung: +110 cm LWS",
      weatherCondition: "Angin laut 22 km/j · Gelombang 1,2 m",
      threatRadiusKm: 3.0,
      criticalFacilities: ["Jalur Arteri Pantura", "Puskesmas Sayung II"],
    },
    recommendation: "Operasikan 4 pompa BBWS & rekayasa buka-tutup jalur alternatif Onggorawe.",
  },
  {
    id: "inc-06",
    title: "Limbah Industri DAS Citarum",
    location: "Batujajar, Bandung Barat",
    province: "Jawa Barat",
    coords: [107.5058, -6.8924],
    hazardType: "iot_sensor",
    mode: "protect",
    urgency: "moderate",
    urgencyScore: 7.5,
    populationAtRisk: 12200,
    lastUpdated: "1j lalu",
    source: "ONLIMO KLHK #08",
    confidence: 95,
    status: "Terverifikasi",
    summary: "Penurunan ekstrem Dissolved Oxygen (DO 1,42 mg/L vs standar >4) dan lonjakan konduktivitas listrik.",
    evidence: {
      satellitePass: "Sentinel-2 Turbidity Index",
      sensorReading: "Sensor DO: 1,42 mg/L · pH 8,8",
      weatherCondition: "Suhu air 29,4°C · Debit 28 m³/s",
      threatRadiusKm: 2.2,
      criticalFacilities: ["Intake PDAM Tirta Raharja", "KJA Saguling"],
    },
    recommendation: "Patroli Satgas Citarum Sektor 9 untuk pengambilan sampel forensik saluran outlet.",
  },
  {
    id: "inc-07",
    title: "Restorasi Gambut Sugihan",
    location: "KHG Sugihan, OKI",
    province: "Sumsel",
    coords: [105.1288, -2.8357],
    hazardType: "hotspot",
    mode: "plan",
    urgency: "moderate",
    urgencyScore: 6.9,
    populationAtRisk: 8600,
    lastUpdated: "2j lalu",
    source: "BRGM + LiDAR DEM",
    confidence: 92,
    status: "Siaga",
    summary: "Analisis intervensi 18 sekat kanal partisipatif. Potensi reduksi risiko kebakaran 64%.",
    evidence: {
      satellitePass: "LiDAR Hydro-topography",
      sensorReading: "Drainase: 1,8 km kanal/km²",
      weatherCondition: "Defisit air historis Jul-Okt",
      threatRadiusKm: 12.0,
      criticalFacilities: ["Desa Peduli Gambut", "Koridor Konservasi Gajah"],
    },
    recommendation: "Rekomendasi alokasi konstruksi sekat kanal BRGM tahun anggaran 2026/2027.",
  },
  {
    id: "inc-08",
    title: "Zonasi PLTS Terapung Cirata II",
    location: "Danau Cirata Barat",
    province: "Jawa Barat",
    coords: [107.3621, -6.7028],
    hazardType: "iot_sensor",
    mode: "plan",
    urgency: "low",
    urgencyScore: 5.6,
    populationAtRisk: 4500,
    lastUpdated: "3j lalu",
    source: "Solar Atlas + Batimetri PLN",
    confidence: 97,
    status: "Terverifikasi",
    summary: "Komparasi 3 zona perairan. Zona Barat (84 Ha, 4,85 kWh/m²/hari) minim konflik nelayan.",
    evidence: {
      satellitePass: "Solar Radiation Atlas",
      sensorReading: "Insolasi: 5,4 jam puncak",
      weatherCondition: "Angin danau 8-14 km/j",
      threatRadiusKm: 1.8,
      criticalFacilities: ["Gardu Induk 150 kV", "Dermaga Nelayan Cilangkap"],
    },
    recommendation: "Prioritaskan Zona Barat untuk studi AMDAL ekspansi 100 MW.",
  },
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: "aud-01",
    action: "VIIRS pass: 8 hotspot Siak terklasifikasi Kritis",
    actor: "Jev Engine",
    time: "8m lalu",
    detail: "Conf 96% · korelasi stasiun TMA gambut (-68 cm).",
  },
  {
    id: "aud-02",
    action: "Rute evakuasi Karawang dialihkan ke Lingkar Barat",
    actor: "Mahardika",
    time: "24m lalu",
    detail: "Menghindari jembatan terendam TMA 185 cm.",
  },
  {
    id: "aud-03",
    action: "Sensor ONLIMO #08 Citarum memicu alert DO < 1,8 mg/L",
    actor: "IoT Node",
    time: "1j lalu",
    detail: "Notifikasi diteruskan ke Satgas Citarum Harum.",
  },
  {
    id: "aud-04",
    action: "Laporan harian #ENV-2026-0928 terbit",
    actor: "Ex Machina",
    time: "3j lalu",
    detail: "Didistribusikan ke BPBD & KLHK.",
  },
];
