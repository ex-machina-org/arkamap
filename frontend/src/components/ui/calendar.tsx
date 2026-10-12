import { Calendar as AriaCalendar } from "react-aria-components";
import type { CalendarDate } from "@internationalized/date";
import { MonthPanel } from "@/components/base/date-picker/shared";

export function Calendar({ value, onChange, "aria-label": ariaLabel = "Calendar" }: { value?: CalendarDate | null; onChange?: (date: CalendarDate) => void; "aria-label"?: string }) {
  return <AriaCalendar value={value} onChange={onChange} aria-label={ariaLabel} className="w-fit rounded-xl border border-border-button-default bg-background-primary-default p-2 shadow-xs"><MonthPanel offset={0} showPrev showNext bare /></AriaCalendar>;
}
