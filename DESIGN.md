# Arkamap Design System

> **Single Source of Truth for Design Tokens, Foundations, Typography, and UI Components in Arkamap.**

This document defines the canonical visual design language for Arkamap. Paths are relative to `frontend/`. **BoardUI** is the sole design authority. All UI built or refactored across the application must strictly adhere to the tokens and component conventions established here.

---

## 1. Core Principles & Architecture

1. **BoardUI is the Authority:** All base controls originate from `src/components/base/` and application cards/patterns from `src/components/application/`. Never introduce duplicate primitives (e.g. `src/components/ui/button.tsx` is prohibited).
2. **Semantic Token Hierarchy:** Never write raw palette colors (`text-red-500`, `bg-emerald-500`) or arbitrary hex classes (`bg-[#1a1a1a]`). Always use semantic role tokens (`text-text-error-primary`, `bg-accent-500`, `text-text-primary`).
3. **Dual-Theme Native:** Every token resolves automatically in both Light Mode (`:root`) and Dark Mode (`.dark`). Surfaces, borders, text, and icons transition cleanly without component-level color hacks.
4. **Unified Class Merging:** Always merge dynamic class names with `cx` (`import { cx } from "@/utils/cx"`) or `cn` (`import { cn } from "@/lib/utils"`). Never import a raw `cn` package.
5. **Remix Icons Only:** All iconography must strictly use `@remixicon/react`. `lucide-react` is completely forbidden.

---

## 2. Color System & Semantic Tokens

### 2.1 Surface & Background Tokens

Surfaces establish hierarchy from the bottom canvas to raised modals.

| Tailwind Class | Light Mode (`:root`) | Dark Mode (`.dark`) | Purpose / Usage |
|---|---|---|---|
| `bg-background-full` | `#ffffff` (Canvas) | `#121212` (Deep full) | Base page canvas / viewport background |
| `bg-background-primary-default` | `#ffffff` (Pure white) | `#171717` (Surface 900) | Primary cards, table bodies, modal bodies, popover content |
| `bg-background-primary-hover` | `#f7f7f7` (Neutral 100) | `#262626` (Surface 800) | Hover state for interactive cards and list items |
| `bg-background-primary-active` | `#ebebeb` (Neutral 200) | `#262626` (Surface 800) | Active/pressed state on primary surfaces |
| `bg-background-secondary-default` | `#f7f7f7` (Neutral 100) | `#171717` (Surface 900) | Sidebar and outer card containers; same dark body surface as primary panels |
| `bg-background-inner-default` | `#ffffff` (Pure white) | Surface 800 at 60% opacity | KPI footer tiles and inner card tiles |
| `bg-background-supporting-default` | Secondary default | Inner default | Compact toolbars, summaries, muted fields, supporting blocks inside panels |
| `bg-background-secondary-hover` | `#ebebeb` (Neutral 200) | `#262626` (Surface 800) | Sidebar item hover, toolbar button hover |
| `bg-background-tertiary-default` | `#ebebeb` (Neutral 200) | `#262626` (Surface 800) | Unselected segmented items, subtle inputs, inactive heatmap cells |
| `bg-background-tertiary-hover` | `#d4d4d4` (Neutral 300) | `#404040` (Surface 700) | Pill hover, subtle button hover |
| `bg-background-tertiary-error` | `#fef2f2` (Red 100/50) | `#450a0a` (Red 950) | Danger callouts, error toast backgrounds |

Dark surface composition follows the [surface hierarchy contract](docs/frontend/DESIGN-SYSTEM.md#surface-hierarchy). Large panel bodies use the primary surface; gray supporting surfaces are reserved for compact areas within them. Do not brighten an entire table or detail panel to distinguish it from the page.

---

### 2.2 Text & Foreground Tokens

Text colors provide calibrated optical contrast across light and dark modes.

| Tailwind Class | Light Mode | Dark Mode | Purpose / Usage |
|---|---|---|---|
| `text-text-primary` | `#0a0a0a` (Ink 950) | `#ffffff` (White) | Page titles, card headlines, primary values, active labels |
| `text-text-secondary` | `#525252` (Neutral 600) | `#d4d4d4` (Neutral 300) | Descriptions, subtitles, table headers, supporting labels |
| `text-text-tertiary` | `#a1a1a1` (Neutral 400) | `#a3a3a3` (Neutral 400) | Captions, timestamps, chart tick labels |
| `placeholder:text-text-placeholder` | `#737373` (Neutral 500) | `#a3a3a3` (Neutral 400) | Active input placeholder text |
| `text-text-disabled` | `#d4d4d4` (Neutral 300) | `#525252` (Neutral 600) | Disabled form fields, disabled button text |
| `text-text-error-primary` | `#ef4444` (Red 500) | `#f87171` (Red 400) | Form validation errors, destructive labels, alert headlines |
| `text-text-white` | `#ffffff` | `#ffffff` | Text strictly over dark fills or CTA gradients |

---

### 2.3 Border & Edge Tokens

Borders separate panels and define interactive element hitboxes.

| Tailwind Class | Light Mode | Dark Mode | Purpose / Usage |
|---|---|---|---|
| `border-border-button-default` | `#ebebeb` (Neutral 200) | `#262626` (Surface 800) | Card borders, default button outlines, input borders |
| `border-border-button-hover` | `#d4d4d4` (Neutral 300) | `#404040` (Surface 700) | Hover border on buttons and interactive containers |
| `border-border-button-active` | `#a1a1a1` (Neutral 400) | `#525252` (Surface 600) | Active/pressed borders |
| `border-border-error-default` | `#ef4444` (Red 500) | `#f87171` (Red 400) | Invalid input borders, error containers |
| `border-border-focus-ring` | `var(--color-accent-500)` | `var(--color-accent-500)` | Accessible 2px keyboard focus ring |
| `border-separator-border` | `#ebebeb` (Neutral 200) | `#262626` (Surface 800) | Horizontal/vertical dividers |

---

### 2.4 Interactive Brand Accent (JOINTS Green)

The brand CTA ramp is retinted to the official BoardUI green export:

| Token | Hex Value | Application |
|---|---|---|
| `accent-50` | `#ecfdf5` | Subtle badge background (light) |
| `accent-100` | `#d1fae5` | Secondary pill fill |
| `accent-200` | `#a7f3d0` | Active selection border |
| `accent-300` | `#6ee7b7` | High-contrast data point |
| `accent-400` | `#34d399` | Primary pill background, focus indicator |
| `accent-500` | `#00bc7d` | **Brand Primary Action / Active Indicator** |
| `accent-600` | `#009966` | Primary gradient bottom stop, hover state |
| `accent-700` | `#047857` | Deep contrast text in light mode |
| `accent-800` | `#065f46` | Contrast container border |
| `accent-900` | `#064e3b` | Dark theme container surface |
| `accent-950` | `#022c22` | Dark theme accent card background |

**Primary Button Gradient:**
```css
--board-primary-gradient: linear-gradient(180deg, #00bc7d 0%, #009966 100%);
```

---

### 2.5 Data Visualization & Chart Tokens

Data visualization colors must remain distinct from interactive CTA selection.

| Role | Semantic Variable | Hex Reference | Typical Usage |
|---|---|---|---|
| `chart-1` | `var(--board-blue)` | `#2b7fff` | Primary telemetry line, atmospheric pressure |
| `chart-2` | `var(--board-success)` | `#00c950` | Revenue/coverage area, normal status |
| `chart-3` | `var(--board-lime)` | `#9ae600` | Earnings bar chart (`bg-chart-3`), high performance |
| `chart-4` | `var(--board-purple)` | `#c27aff` | Incident clustering, agent distribution |
| `chart-5` | `var(--board-yellow)` | `#fff085` | Marginal telemetry, secondary comparisons |

---

## 3. Typography Specification

The typography system is powered by **Inter Variable** (self-hosted). Never use arbitrary font sizes (`text-[13px]`) or non-standard weights.

Capitalize Each Word in page titles, section titles, table headers, and control labels. Do not apply `uppercase` to these labels. Preserve established acronyms such as IoT and BYOD.

### 3.1 Display Scale (Hero & Marketing)

| Class | Font Size / Line Height | Tracking | Weight |
|---|---|---|---|
| `text-display-2xl` | 72px / 90px (4.5rem / 5.625rem) | `-0.02em` | `font-semibold` (600) |
| `text-display-xl` | 60px / 72px (3.75rem / 4.5rem) | `-0.02em` | `font-semibold` (600) |
| `text-display-lg` | 48px / 60px (3rem / 3.75rem) | `-0.02em` | `font-semibold` (600) |
| `text-display-md` | 36px / 44px (2.25rem / 2.75rem) | `-0.02em` | `font-semibold` (600) |
| `text-display-sm` | 30px / 38px (1.875rem / 2.375rem) | `-0.02em` | `font-semibold` (600) |
| `text-display-xs` | 24px / 32px (1.5rem / 2rem) | `-0.02em` | `font-semibold` (600) |

---

### 3.2 Headings (Dashboard & Navigation)

| Class | Font Size / Line Height | Weight | Usage |
|---|---|---|---|
| `text-heading-xl` | 20px / 28px (1.25rem / 1.75rem) | `font-semibold` (600) | Page titles, primary modal headers |
| `text-heading-lg` | 18px / 26px (1.125rem / 1.625rem) | `font-semibold` (600) | Card major titles, section headers |
| `text-heading-md` | 16px / 24px (1rem / 1.5rem) | `font-semibold` (600) | Standard card titles, dialog titles |
| `text-heading-sm` | 14px / 20px (0.875rem / 1.25rem) | `font-semibold` (600) | Metric group titles, table column groups |
| `text-heading-xs` | 12px / 18px (0.75rem / 1.125rem) | `font-semibold` (600) | Section labels, compact metadata |

---

### 3.3 Body & Interface Text

| Class | Font Size / Line Height | Weight | Usage |
|---|---|---|---|
| `text-body-large` | 16px / 24px (1rem / 1.5rem) | `font-normal` (400) | Long-form reading, hero introductory body |
| `text-body-medium` | 14px / 20px (0.875rem / 1.25rem) | `font-medium` (500) | **Default button text, nav links, active items** |
| `text-body-regular` | 14px / 20px (0.875rem / 1.25rem) | `font-normal` (400) | **Standard dashboard body text, table cell text** |
| `text-body-compact` | 13px / 18px (0.8125rem / 1.125rem)| `font-normal` (400) | Compact data lists, sidebar item subtitles |
| `text-caption-1` | 12px / 16px (0.75rem / 1rem) | `font-normal` (400) | Field captions, helper text, timestamps |
| `text-caption-1-semibold` | 12px / 16px (0.75rem / 1rem) | `font-semibold` (600) | Counter badges, chip text |
| `text-caption-2` | 11px / 14px (0.6875rem / 0.875rem)| `font-normal` (400) | Micro tags, tertiary chart indicators |

---

## 4. Spacing, Radii & Elevation

### 4.1 Spacing Scale

Based on the 4px baseline grid (`--board-space-*`):

| Variable / Class | Value | Usage |
|---|---|---|
| `gap-1` / `p-1` | 4px | Micro spacing, icon badge offsets |
| `gap-1.5` / `p-1.5` | 6px | Compact item gaps in menus |
| `gap-2` / `p-2` | 8px | Standard component internal padding, icon + label spacing |
| `gap-2.5` / `p-2.5` | 10px | Sidebar item padding, dropdown menu padding |
| `gap-3` / `p-3` | 12px | Compact card padding, dialog content gap |
| `gap-4` / `p-4` | 16px | Standard card content padding, table header padding |
| `gap-5` / `p-5` | 20px | Section content spacing |
| `gap-6` / `p-6` | 24px | Dashboard grid gap, page section margins |
| `gap-8` / `p-8` | 32px | Page header bottom margin |

---

### 4.2 Border Radii Scale

| Class | Value | Canonical Usage |
|---|---|---|
| `rounded-xs` | 2px | Micro tags, checkbox check indicator |
| `rounded-sm` | 4px | Badge pills (`Badge`), dropdown sub-items |
| `rounded-md` | 6px | Small buttons, compact controls |
| `rounded-lg` | 8px | Standard inputs, dialog action buttons |
| `rounded-2lg` | 10px | **Canonical BoardUI button (`Button`), dropdown menu panels** |
| `rounded-xl` | 12px | Sidebar active indicators, stat summary boxes |
| `rounded-2xl` | 16px | **Canonical BoardUI cards, modal dialogs, map containers** |
| `rounded-full` | 9999px | Avatars, Chip indicators, pill tags, theme toggle |

---

Button and ButtonLink share a height scale: `medium` 40px, `small` 36px, and `xs` 28px. Icon-only variants use matching square dimensions. This workspace adaptation adds 4px to the original BoardUI heights; apply it in the shared component rather than overriding individual buttons.

### 4.3 Elevation & Shadows

BoardUI relies on subtle contact shadows rather than heavy drop shadows:

| Shadow Utility | Definition | Application |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgb(0 0 0 / 0.05)` | White stat cards on neutral backgrounds |
| `shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.10)` | Interactive cards on hover |
| `shadow-dropdown` | `0 1px 1px rgb(0 0 0 / 0.04), 0 4px 4px rgb(0 0 0 / 0.02)` | Dropdown menus, popover menus, flyouts |
| `shadow-sidebar` | Multi-layer panel elevation | Collapsible sidebar edge depth |
| `shadow-nav-selected` | `0 0 0 1px var(--color-accent-500), inset 0 1px 0 #ffffff40` | Selected navigation items |

---

## 5. Iconography Standard

- **Icon Library:** Strictly `@remixicon/react`.
- **Default Style:** Outline/Line variants (`Ri*Line`, e.g., `RiDashboardLine`, `RiFireLine`, `RiCompass3Line`).
- **Active / Solid Style:** Fill variants only for active states (`Ri*Fill`, e.g., `RiCheckboxCircleFill`).
- **Standard Sizing Classes:**
  - `size-4` (16px): Inside compact buttons, inputs, badge indicators.
  - `size-4.5` (18px): Standard mode switcher and sidebar icons.
  - `size-5` (20px): Primary card header icons, action toolbar buttons.
  - `size-6` (24px): Empty state banners, large modal icons.

---

## 6. Canonical Component Registry

All UI must import components from these canonical locations:

| Component Role | Canonical Import Path | Never Import From |
|---|---|---|
| **Button** | `import { Button } from "@/components/base/buttons/button"` | `components/ui/button` (Deleted) |
| **Badge** | `import { Badge } from "@/components/base/badges/badge"` | `components/ui/badge` (Deleted) |
| **Chip (Delta/Pill)** | `import { Chip } from "@/components/base/badges/chip"` | Raw HTML `<span className="badge">` |
| **Input** | `import { Input } from "@/components/base/inputs/input"` | `components/ui/input` (Deleted) |
| **Avatar** | `import { Avatar } from "@/components/base/avatar/avatar"` | Custom `<img className="rounded-full">` |
| **Switch** | `import { Switch } from "@/components/base/switch/switch"` | Custom toggle divs |
| **Checkbox** | `import { Checkbox } from "@/components/base/checkbox/checkbox"` | Native `<input type="checkbox">` |
| **Tabs** | `import { Tabs } from "@/components/base/tabs/tabs"` | Unstyled button lists |
| **Dialog / Modal** | `import { Dialog } from "@/components/base/dialog/dialog"` | Uncontrolled custom overlays |
| **App Shell** | `import { JointsAppShell } from "@/components/application/app-shell/joints-app-shell"` | Custom layout divs |
| **Data Table** | `import { DataTable } from "@/components/application/data-table/data-table"` | Raw `<table>` without TanStack |
| **Theme Toggle** | `import { ThemeToggle } from "@/components/application/theme/theme-toggle"` | Custom theme buttons |
| **Map Base** | `import { Map, MapMarker, useMap } from "@/components/ui/map"` | Raw leaflet/mapbox without container |

---

## 7. Guardrails (Do's & Don'ts)

| Category | ❌ DO NOT DO | ✅ ALWAYS DO |
|---|---|---|
| **Buttons** | `import { Button } from "@/components/ui/button"` | `import { Button } from "@/components/base/buttons/button"` |
| **Icons** | `import { ArrowRight } from "lucide-react"` | `import { RiArrowRightLine } from "@remixicon/react"` |
| **Class Joiner** | `import { cn } from "cn"` | `import { cx } from "@/utils/cx"` or `import { cn } from "@/lib/utils"` |
| **Colors** | `className="text-red-500 bg-neutral-900"` | `className="text-text-error-primary bg-background-full"` |
| **Arbitrary Hexes** | `className="bg-[#1a1a1a] text-[#fff]"` | Use semantic tokens: `bg-background-secondary-default text-text-primary` |
| **Typography** | `className="text-[13px] font-[550]"` | `className="text-body-compact"` or `className="text-heading-sm"` |
| **Card Radii** | `className="rounded-3xl"` or `className="rounded-none"` | `className="rounded-2xl"` for cards, `rounded-2lg` for controls |
| **Borders** | `className="border-gray-200 dark:border-gray-800"` | `className="border-border-button-default"` |
