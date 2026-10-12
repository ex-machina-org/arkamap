import { useState } from "react";
import { Command } from "cmdk";
import { RiCheckLine, RiSearchLine } from "@remixicon/react";
import { MENU_ITEM, MENU_ITEM_ACTIVE } from "@/components/base/dropdown/menu-styles";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Options sharing a group render under one sticky heading, in first-seen order. */
  group?: string;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  label: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
};

const GROUP_HEADING = [
  "[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10",
  "[&_[cmdk-group-heading]]:my-1 [&_[cmdk-group-heading]]:border-y [&_[cmdk-group-heading]]:border-separator-border",
  "[&_[cmdk-group-heading]]:bg-background-secondary-default [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1",
  "[&_[cmdk-group-heading]]:text-caption-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-state-success-text dark:[&_[cmdk-group-heading]]:text-notification-success-foreground",
].join(" ");

export function Combobox({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Choose an option",
  label,
  searchPlaceholder = "Search options...",
  emptyText = "No options found.",
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const text = selected.length
    ? selected
        .map((id) => {
          const found = options.find((option) => option.value === id);
          if (!found) return id;
          return found.group ? `${found.label} (${found.group})` : found.label;
        })
        .join(", ")
    : placeholder;

  function select(id: string) {
    if (multiple) onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
    else { onChange(id); setOpen(false); }
  }

  const groups = new Map<string | undefined, ComboboxOption[]>();
  for (const option of options) groups.set(option.group, [...(groups.get(option.group) ?? []), option]);

  function renderItem(option: ComboboxOption) {
    return (
      <Command.Item
        key={option.value}
        value={`${option.label} ${option.group ?? ""} ${option.value}`}
        onSelect={() => select(option.value)}
        onClick={() => select(option.value)}
        className={cx(MENU_ITEM, "justify-between text-body-medium data-[selected=true]:bg-dropdown-item-hover-background", selected.includes(option.value) && MENU_ITEM_ACTIVE)}
      >
        <span className="truncate">{option.label}</span>
        {selected.includes(option.value) && <RiCheckLine className="size-4 shrink-0 text-text-secondary" aria-hidden />}
      </Command.Item>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cx("flex flex-col gap-1.5", className)}>
        <span className="text-body-medium font-medium text-text-primary">{label}</span>
        <PopoverTrigger
          aria-label={label}
          disabled={disabled}
          className={cx(
            "flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-2lg px-2.5 py-2 text-left text-body-medium text-text-primary",
            "border border-border-input-default bg-background-primary-default shadow-xs outline-none",
            "transition-[background-color,border-color,box-shadow] duration-200 ease",
            "hover:border-border-button-hover hover:bg-background-primary-hover",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
            "disabled:cursor-not-allowed disabled:bg-background-primary-disabled disabled:text-text-tertiary disabled:shadow-none",
          )}
        >
          <span className={cx("truncate", !selected.length && "text-text-tertiary")}>{text}</span>
          <ChevronDownSmall className={cx("size-4 shrink-0 text-text-secondary transition-transform duration-200 ease", open && "rotate-180")} aria-hidden />
        </PopoverTrigger>
      </div>
      <PopoverContent sideOffset={4} className="w-(--anchor-width) !max-w-[calc(100vw-32px)] !rounded-2xl !p-2">
        <Command className="text-text-primary" loop>
          <div className="flex items-center gap-2 border-b border-separator-border px-2">
            <RiSearchLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
            <Command.Input autoFocus aria-label={`Search ${label}`} placeholder={searchPlaceholder} className="h-10 w-full bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary" />
          </div>
          <Command.List className="mt-1 max-h-60 overflow-y-auto [scrollbar-width:thin]">
            <Command.Empty className="px-2 py-6 text-center text-caption-1 text-text-secondary">{emptyText}</Command.Empty>
            {Array.from(groups, ([group, items]) =>
              group === undefined
                ? items.map(renderItem)
                : <Command.Group key={group} heading={group} className={GROUP_HEADING}>{items.map(renderItem)}</Command.Group>,
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
