import { Avatar } from "@/components/base/avatar/avatar";

export function UserIdentity({ name, detail, initials }: { name: string; detail: string; initials: string }) {
  return <div className="flex min-w-0 items-center gap-3"><Avatar initials={initials} color="lime" size="lg" /><div className="min-w-0"><p className="truncate text-sm font-medium text-text-primary">{name}</p><p className="truncate text-xs text-text-secondary">{detail}</p></div></div>;
}
