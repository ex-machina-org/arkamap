import { EnvironmentalDashboardWorkspace } from "@/features/environmental-dashboard";

export default function DeviceDetailPage({ id }: { id: number }) {
  return <EnvironmentalDashboardWorkspace devicePage="detail" deviceId={id} />;
}
