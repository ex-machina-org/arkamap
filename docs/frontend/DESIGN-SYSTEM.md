# Design system contract

## Authority and token flow

BoardUI's app shell is the visual authority. `src/styles/theme.css` owns its semantic surfaces, text, control states, shadows, and dark theme. `src/index.css` owns JOINTS's green accent override, export-derived primitive values, and the compatibility aliases used by shadcn/MapCN. `src/styles/typography.css` owns BoardUI type utilities.

```text
BoardUI palette primitives -> BoardUI role token -> Tailwind utility
                          -> JOINTS compatibility alias -> shadcn utility
```

`--board-*` values preserve the supplied light export and normalized scales. They are not theme-aware surface tokens. Use BoardUI role tokens or their compatibility aliases in product UI. Keep chart/data hues separate from interactive selection hues.

## Dark surface mapping

Aliases in `.dark` reference BoardUI roles rather than repeating color values:

| JOINTS utility | BoardUI authority | Role |
| --- | --- | --- |
| `bg-background` | `--color-background-full` | App shell canvas, neutral-925 |
| `bg-card`, `bg-popover` | `--color-background-primary-default` | Panel bodies, dialogs, popovers, and controls, neutral-900 |
| `bg-sidebar` | `--color-background-secondary-default` | Sidebar and outer card bodies, neutral-900 |
| `bg-muted` | `--color-background-supporting-default` | Compact supporting areas; inner surface in dark mode |
| `bg-secondary` | `--color-background-tertiary-default` | Quiet controls, neutral-800 |
| `bg-accent`, `bg-sidebar-accent` | `--color-background-primary-hover` | Hover surface |
| `text-foreground` | `--color-text-primary` | Primary text, neutral-50 |
| `text-muted-foreground` | `--color-text-secondary` | Supporting text |
| `border-border`, `border-input` | `--color-border-button-default` | Control and panel edge, neutral-700 |

Prefer the direct BoardUI utility when composing BoardUI. Compatibility aliases exist for shadcn, MapCN, and existing JOINTS compositions. Keep both paths consistent when changing a role. Do not confuse the canvas with a raised panel: their different values are intentional.

## Surface hierarchy

Use the KPI card composition as the shared dark-mode pattern across product routes and catalog components. The purpose is to keep large surfaces quiet so values, statuses, and actions carry the visual emphasis.

| Layer | Role token | Usage |
| --- | --- | --- |
| Canvas | `background-full` | Page and workspace background; neutral-925 in dark mode |
| Panel body | `background-primary-default` | Cards, table bodies, forms, detail panels, dialogs, and popovers; neutral-900 in dark mode |
| Outer container | `background-secondary-default` | Sidebar and existing BoardUI card shells; shares the panel body color in dark mode |
| Supporting area | `background-supporting-default` | Compact toolbar, summary block, muted input, or inset information; uses the KPI inner surface in dark mode |
| KPI inner tile | `background-inner-default` | KPI footer tile; preserve its original light-mode white tile |
| Interaction | `background-primary-hover`, `background-primary-active` | Hover, neutral selection, pressed/open states; neutral-800 in dark mode |

- Components with the same role use the same token, regardless of route or component family. A panel must not use tertiary/hover gray across its whole resting body.
- Supporting gray occupies a compact part of a panel. Use spacing, titles, borders, and separators to divide larger sections instead of increasing their overall brightness. Supporting fills are used over an opaque panel body, including map overlays.
- Use interaction tokens for hover and neutral selection, never the resting sidebar/body token. Keep focus rings, disabled treatment, and semantic status/brand accents distinct.
- Match sticky table cells to their row/header surface. A selected row must remain visibly selected, including its sticky action cell.
- Do not introduce feature-specific hex values, raw neutral utilities, or blanket CSS overrides. Change the owning role in `theme.css`; keep compatibility aliases in `index.css` aligned.
- Primary and secondary remain distinct in light mode. The supporting role retains the existing light secondary fill; the KPI inner tile retains white.

The accent ramp in `index.css` uses the export's green. Primary action/selection, focus rings, status, and chart series are separate semantic decisions. Status utilities `success`, `info`, and `warning` support existing JOINTS components; BoardUI notification/chip tokens retain their own documented status roles.

## Typography and geometry

Inter Variable is self-hosted. Use BoardUI `text-body-*`, `text-caption-*`, and heading utilities for its components. Type scale and normalized values are recorded in [Design system specification](../../DESIGN.md).

## Motion, hover, and scrollbars

These rules are adapted from [Fluid Functionalism](https://www.fluidfunctionalism.com/docs/). Its size ladder, type scale, and surface ladder are not adopted; BoardUI keeps those.

- **Springs:** animate with the tiers in `src/lib/springs.ts` instead of hand-written durations. `fast` (0.08s) for hover, fades, and tooltips; `moderate` (0.16s, no overshoot) for dropdowns, tabs, and drawers; `slow` (0.24s, slight bounce) for dialogs and large surfaces. Exits use the tier's `.exit` tween, which is quicker than the enter. Animate `transform` and `opacity`, not `top`, `left`, `width`, or `height`.
- **Reduced motion:** `main.tsx` wraps the app in `<MotionConfig reducedMotion="user">`, which drops transform and layout animation but keeps opacity and color fades. CSS animations still need their own `prefers-reduced-motion` rule.
- **Fluid hover:** a list of click targets can share one highlight that glides to the row nearest the pointer, using `useFluidHover` (`src/hooks/use-fluid-hover.ts`) and `FluidHoverHighlight` (`src/components/base/fluid-hover/`). Rows that join the list drop their CSS hover fill and become `relative` so they paint above the highlight. Use one list per group of alternatives; the dashboard sidebar uses one per section. Skip it where a wrong click is costly, where only some items are clickable, or where rows move while scrolling.
- **Scrollbars:** `globals.css` styles every scrollbar on precise pointers: a 10px track with a 4px thumb in the `scrollbar-thumb` tokens, which strengthen on hover and drag. Touch devices keep native scrollbars. Scrollers that hide their bar on purpose keep `[scrollbar-width:none]`. Add `scroll-fade` (or `scroll-fade-x`) to a scroller to dissolve content toward edges that have more to scroll; browsers without scroll-driven animations show no fade.
- **Font:** Inter loads with its optical-size axis (`@fontsource-variable/inter/opsz.css`), so small text uses the more open text cut automatically.

## Responsive behavior

Follow the selected shell's behavior and neighboring components. `JointsAppShell` changes navigation at `lg`; the design-system navigation changes at `md`. These are different layouts with explicit responsibilities, not a universal breakpoint. Keep JS and CSS decisions synchronized within each pattern. Reflow dense content instead of shrinking it; ensure overlays fit small screens and map controls remain usable.

## Editing tokens

Change the owning semantic role, not individual callers. Check both themes and all affected controls. Document any one-off brand asset, map layer color, or third-party compatibility value that cannot use a semantic utility. Do not create a second palette in feature CSS.

The light export does not establish dark or responsive behavior. The installed BoardUI theme and app shell now establish the dark palette used by JOINTS. [UI checklist](./UI-CHECKLIST.md) defines visual verification.

## Input surfaces

The shared Input and InputBase use the primary surface, `border-input-default` control border, and subtle shadow, matching Select triggers. Muted input backgrounds are reserved for disabled state or an explicit caller override such as toolbar search. Hover strengthens the border; keyboard focus uses the focus-ring token.

The app-shell command search trigger also uses `border-input-default`, the primary surface, and the input focus-ring treatment. Show `Ctrl K` on Windows/Linux and the Command key with `K` on Apple platforms; encode special shortcut symbols with Unicode escapes to prevent corrupted text. Keep the visible hint aligned with the registered keyboard shortcut and expose it through `aria-keyshortcuts`.

Supporting text uses neutral-600 in light mode and neutral-300 in dark mode. Input placeholders use the dedicated `text-placeholder` role (neutral-500 light, neutral-400 dark); avoid tertiary or disabled text roles for readable form instructions. Input and Select boundaries use `border-input-default` (neutral-300 light, neutral-500 dark).
