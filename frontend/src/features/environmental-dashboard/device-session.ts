import { INITIAL_DEVICES, type IotDevice } from "./device-data";

const SESSION_KEY = "joints-device-registrations";

export function readDevices(): IotDevice[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]");
    if (!Array.isArray(stored)) return INITIAL_DEVICES;
    const devices = stored.filter((value): value is IotDevice =>
      typeof value === "object" && value !== null &&
      typeof value.id === "string" && typeof value.name === "string" &&
      typeof value.owner === "string" && typeof value.location === "string" &&
      typeof value.province === "string" && typeof value.lastSeen === "string" &&
      ["awlr", "peat_level", "air_quality", "water_quality", "rainfall"].includes(value.kind) &&
      ["institution", "byod"].includes(value.ownership) &&
      ["online", "offline", "calibration"].includes(value.status) &&
      (value.battery === null || (typeof value.battery === "number" && value.battery >= 0 && value.battery <= 100))
    );
    return [...INITIAL_DEVICES, ...devices];
  } catch {
    return INITIAL_DEVICES;
  }
}

export function registerDevice(device: IotDevice) {
  const existing = readDevices();
  if (existing.some((item) => item.id.toLocaleLowerCase() === device.id.toLocaleLowerCase())) {
    throw new Error("ID Perangkat Sudah Digunakan. Gunakan ID Lain.");
  }
  const initialIds = new Set(INITIAL_DEVICES.map((item) => item.id));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...existing.filter((item) => !initialIds.has(item.id)), device]));
}
