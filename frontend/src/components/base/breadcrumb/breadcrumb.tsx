import Link from "@/boardui-compat/link";
import { createContext, useContext, Children, Fragment, isValidElement } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import { ChevronRightSmall } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

/**
 * Figma source: Board UI → dashboard 1 breadcrumb (node 3731:3011).
 *
 * Trail of ancestor pages separated by chevrons.
 *   item      Body Medium (14px) or Caption 1/Medium (12px), text/tertiary, gap 6 (icon/avatar ↔ label)
 *   hover     interactive items darken to text/secondary with a soft
 *             background/primary/hover pill
 *   current   aria-current="page", neutral/700, not interactive
 *   separator ChevronRightSmall, text/tertiary, gap 10 between items
 *
 * Compose <BreadcrumbItem>s inside <Breadcrumb>; separators are inserted
 * automatically. An item becomes a link when given `href`, a button when given
 * `onClick`, otherwise a plain label (use `current` for the active page).
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type BreadcrumbSize = "sm" | "md";

const BreadcrumbContext = createContext<{ size: BreadcrumbSize }>({ size: "md" });

export interface BreadcrumbProps {
  children: ReactNode;
  "aria-label"?: string;
  size?: BreadcrumbSize;
  className?: string;
  ref?: Ref<HTMLElement>;
}

export function Breadcrumb({
  children,
  "aria-label": ariaLabel = "Breadcrumb",
  size = "md",
  className,
  ref,
}: BreadcrumbProps) {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <BreadcrumbContext.Provider value={{ size }}>
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cx(
          "flex w-full items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        <ol className="flex items-center gap-2 px-0.5">
          {items.map((item, index) => (
            <Fragment key={item.key ?? index}>
              {index > 0 && (
                <ChevronRightSmall
                  className={cx(
                    "shrink-0 text-text-tertiary",
                    size === "md" ? "size-3.5" : "size-3",
                  )}
                  aria-hidden
                />
              )}
              {item}
            </Fragment>
          ))}
        </ol>
      </nav>
    </BreadcrumbContext.Provider>
  );
}

export interface BreadcrumbItemProps {
  children?: ReactNode;
  /** Optional leading icon, inherits the item color. */
  icon?: IconComponent;
  href?: string;
  onClick?: () => void;
  /** Marks the active page: not interactive, darker text. */
  current?: boolean;
  size?: BreadcrumbSize;
  className?: string;
}

export function BreadcrumbItem({
  children,
  icon: Icon,
  href,
  onClick,
  current = false,
  size: propSize,
  className,
}: BreadcrumbItemProps) {
  const context = useContext(BreadcrumbContext);
  const size = propSize ?? context.size ?? "md";
  const isMd = size === "md";

  const content = (
    <>
      {Icon && (
        <Icon
          className={cx("shrink-0", isMd ? "size-4.5" : "size-4")}
          aria-hidden
        />
      )}
      {children}
    </>
  );

  const textStyle = isMd ? "text-body-medium" : "text-caption-1-medium";

  if (current) {
    return (
      <li
        aria-current="page"
        className={cx(
          "flex items-center gap-1.5 whitespace-nowrap text-text-primary font-medium",
          textStyle,
          className,
        )}
      >
        {content}
      </li>
    );
  }

  const interactiveClass = cx(
    "-mx-1 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 whitespace-nowrap text-text-secondary",
    textStyle,
    "transition-colors duration-150 ease outline-none",
    "hover:bg-background-primary-hover hover:text-text-primary",
    "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
    className,
  );

  return (
    <li className="flex items-center">
      {href ? (
        <Link href={href} className={interactiveClass}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cx("cursor-pointer", interactiveClass)}>
          {content}
        </button>
      )}
    </li>
  );
}
