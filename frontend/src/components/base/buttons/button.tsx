import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  ReactNode,
  Ref,
} from "react";
import { cx, sortCx } from "@/utils/cx";

/**
 * Figma source: Board UI → Buttons (node 3656:13819).
 *
 * Variant matrix from Figma:
 *   Type     = Primary | Secondary | Ghost | Danger
 *   Size     = Medium  | Small | Xs
 *   State    = Default | Hover | Active | Disabled        (CSS pseudo)
 *   OnlyIcon = false   | true
 *
 * Original Figma sizing (JOINTS adds 4px of height to each size):
 *
 *                       Medium                    Small                     Xs
 *   container          h=36, p=8,   r=10         h=32, px=8 py=6, r=8      h=24, px=8, r=4
 *   gap                 2px                       2px                      1.33px→1
 *   icon                20×20                     18×18                    14×14
 *   label wrapper       px=4                      px=2                     px=2
 *   text style          Body 1/Medium             Body 1/Medium            Caption 1/Semibold
 *   icon-only square    36×36 (content-derived)   32×32 (forced size)      24×24 (forced size)
 *
 * `xs` is the smallest tier — first needed for the calendar template's
 * event-details modal ("Join" / edit-icon buttons, node 3920:10954), which
 * scales every dimension down by the same ~0.667 factor from Figma; the
 * table above rounds those to clean pixel values rather than reproducing
 * the fractional source numbers.
 *
 * Icons are rendered by the component itself via the `leadingIcon` /
 * `trailingIcon` props so the consumer can't pass the wrong size. Pass
 * a Remix Icon component reference (`RiAddLine`, not `<RiAddLine />`).
 *
 * For icon-only buttons:
 *   <Button iconOnly leadingIcon={RiAddLine} aria-label="Add" />
 *
 * The HTML `type` prop is preserved; Figma's "Type" enum is renamed to
 * `variant` to avoid the clash.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "medium" | "small" | "xs";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

const styles = sortCx({
  base: [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden",
    "font-sans select-none cursor-pointer",
    "button-press-motion",
    "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
    "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
  ].join(" "),

  // Base shape per size (standard BoardUI radii)
  size: {
    medium: "h-10 rounded-2lg px-4 text-body-medium",
    small:  "h-9 rounded-lg px-3.5 py-1 text-body-medium",
    xs:     "h-7 rounded-sm px-2.5 text-caption-1-semibold",
  },

  // Icon-only override:
  iconOnlySize: {
    medium: "size-10 p-0",
    small:  "size-9 p-0",
    xs:     "size-7 p-0",
  },

  icon: {
    medium: "size-5 shrink-0",        // 20px
    small:  "size-[18px] shrink-0",   // 18px
    xs:     "size-3.5 shrink-0",      // 14px
  },

  label: {
    medium: "inline-flex items-center justify-center px-1 shrink-0 font-medium",
    small:  "inline-flex items-center justify-center px-0.5 shrink-0 font-medium",
    xs:     "inline-flex items-center justify-center px-0.5 shrink-0 font-medium",
  },

  variant: {
    primary: [
      "relative border text-text-white transition-all duration-150",
      "border-[#008f5d] dark:border-[#00a86b]",
      "bg-linear-to-b from-accent-500 to-accent-600",
      "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.5),inset_0_-1px_1px_0_rgba(0,0,0,0.22),0_4px_14px_0_rgba(0,188,125,0.36),0_1px_2px_0_rgba(0,0,0,0.08)]",
      "hover:from-accent-400 hover:to-accent-500",
      "hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.7),inset_0_-1px_1px_0_rgba(0,0,0,0.18),0_6px_20px_0_rgba(0,188,125,0.48),0_2px_4px_0_rgba(0,0,0,0.1)]",
      "active:translate-y-[0.5px] active:from-accent-600 active:to-accent-700",
      "active:shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.35),0_2px_6px_0_rgba(0,188,125,0.2)]",
      "disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none",
      "aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:pointer-events-none",
    ].join(" "),
    danger: [
      "relative border text-text-white transition-all duration-150",
      "border-red-700/70 dark:border-red-500/50",
      "bg-linear-to-b from-red-500 to-red-600",
      "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.5),inset_0_-1px_1px_0_rgba(0,0,0,0.22),0_4px_14px_0_rgba(239,68,68,0.36),0_1px_2px_0_rgba(0,0,0,0.08)]",
      "hover:from-red-400 hover:to-red-500",
      "hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.7),0_6px_20px_0_rgba(239,68,68,0.48)]",
      "active:translate-y-[0.5px] active:shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.35)]",
      "disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none",
      "aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:pointer-events-none",
    ].join(" "),
    secondary: [
      "relative border text-text-primary transition-all duration-150",
      "border-border-button-default bg-background-primary-default",
      "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.8),inset_0_-1px_1px_0_rgba(0,0,0,0.06),0_2px_6px_0_rgba(0,0,0,0.04)]",
      "dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.1),0_2px_6px_0_rgba(0,0,0,0.2)]",
      "hover:bg-background-primary-hover hover:border-border-button-hover",
      "hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.9),0_3px_10px_0_rgba(0,0,0,0.06)]",
      "active:translate-y-[0.5px] active:bg-background-primary-active active:shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.1)]",
      "disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none",
      "aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:pointer-events-none",
    ].join(" "),
    ghost: [
      "bg-button-ghost-background text-button-ghost-foreground transition-colors",
      "hover:bg-button-ghost-hover active:bg-button-ghost-active",
      "disabled:bg-button-ghost-disabled disabled:text-button-ghost-disabled-foreground disabled:shadow-none",
      "aria-disabled:bg-button-ghost-disabled aria-disabled:text-button-ghost-disabled-foreground aria-disabled:shadow-none",
    ].join(" "),
  },
});

export function Button({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        styles.base,
        styles.size[size],
        styles.variant[variant],
        iconOnly && styles.iconOnlySize[size],
        className,
      )}
      {...props}
    >
      {Leading ? <Leading className={styles.icon[size]} aria-hidden /> : null}
      {!iconOnly && children !== undefined && children !== null && (
        <span className={styles.label[size]}>{children}</span>
      )}
      {!iconOnly && Trailing ? (
        <Trailing className={styles.icon[size]} aria-hidden />
      ) : null}
    </button>
  );
}

/** Anchor counterpart to Button for navigational actions. */
export function ButtonLink({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  ref,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      ref={ref}
      className={cx(
        styles.base,
        styles.size[size],
        styles.variant[variant],
        iconOnly && styles.iconOnlySize[size],
        className,
      )}
      {...props}
    >
      {Leading ? <Leading className={styles.icon[size]} aria-hidden /> : null}
      {!iconOnly && children !== undefined && children !== null && (
        <span className={styles.label[size]}>{children}</span>
      )}
      {!iconOnly && Trailing ? (
        <Trailing className={styles.icon[size]} aria-hidden />
      ) : null}
    </a>
  );
}

/** Style maps, exported for advanced composition and the dev Design Tuner. */
export const buttonStyles = styles;
