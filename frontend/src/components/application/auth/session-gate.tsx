import { Button } from "@/components/base/buttons/button";

/** Shown instead of a protected route while the session cannot be verified. */
export function SessionGate({ error, onRetry, onLeave }: { error: string; onRetry: () => void; onLeave: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background-full px-4 text-center" role="alert">
      <div className="space-y-1">
        <h1 className="text-heading-lg text-text-primary">Sesi Tidak Dapat Diverifikasi</h1>
        <p className="text-body-regular text-text-secondary">{error}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onRetry}>Coba lagi</Button>
        <Button variant="secondary" onClick={onLeave}>Ke peta</Button>
      </div>
    </div>
  );
}
