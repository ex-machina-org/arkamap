# Component selection and extension

## Selection order

1. Search the catalog registry and neighboring implementation.
2. Prefer existing BoardUI base controls and application patterns for product UI.
3. Use the existing shadcn capability when BoardUI lacks it or an existing composition relies on it.
4. Use MapCN exports from `components/ui/map.tsx` for map capabilities.
5. Add a feature component for domain behavior; add an application composition only when domain-agnostic reuse is real.

| Need | Default source | Contract |
| --- | --- | --- |
| Actions | `components/base/buttons/button.tsx` | `variant`: primary/secondary/ghost/danger; `size`: medium/small/xs; icon component references |
| Text input, select, tabs, checkbox | Catalog's BoardUI `base` source | Read the selected API and preview before use |
| Dialog, sheet, command, popover | Existing `components/ui` capability | Compose with BoardUI actions and semantic surface aliases |
| App shell | `application/app-shell/joints-app-shell.tsx` | Sidebar and header: breadcrumbs, command search immediately left of notifications; responsive navigation trigger |
| GIS layers/controls | `components/ui/map.tsx` | Reuse MapCN with Remix icons; tiles require network |
| Tables, charts, notifications | Existing `application` pattern | Demo fixtures are not operational records |
| Empty/error/progress state | Existing JOINTS catalog entry | Preserve labels, keyboard behavior, and data honesty |

Use Remix icons (`@remixicon/react`) exclusively across all components. Do not import from `lucide-react` or introduce another icon family.

## Extension boundary

Treat copied BoardUI and generated shadcn controls as upstream-owned implementation. Prefer caller styling for a local adjustment, a feature component for domain behavior, or an application wrapper for a reusable pattern. An actual upstream defect may require a minimal source fix; record the reason and verification in the PR. Do not hide a behavioral defect behind global CSS.

Do not mass-migrate existing shadcn callers simply to eliminate duplication. The goal is a clear default and compatible visual roles, not a risky replacement of working interactions.

## Catalog contract

Every new public component needs a registry entry with its real source path, usage guidance, and a rendered example including relevant states. Keep preview and copyable example connected to one module as new examples are created. `src/app/design-system/examples/login-modal.tsx` is the first shared preview/source example; set the registry entry's `example` path so page exports include it. Existing inline catalog snippets remain older examples; they are not guaranteed to include all props or dependencies.

The catalog's page export reads actual implementation source with Vite raw imports, so readers see the authoritative API rather than infer it from a snippet. Export text includes source paths and context pointers. Large modules are explicitly omitted from the export and remain available at the supplied path.

Run `npm run catalog:check` after catalog changes. The checker verifies registered sources exist, slugs are unique, and examples have a recognized render path. It does not prove accessibility or runtime behavior.

## Data table composition

`DataTable` in `application/data-table/data-table.tsx` accepts typed `data` and TanStack `columns`, an accessible `label`, `emptyMessage`, and an optional `toolbar`. It reuses the catalog Table, sorting indicators, and Pagination. Keep domain cells and search/filter state in the owning feature. `DataTableExample` retains the customer demo, including selection and density controls.

DataTable column headers open a BoardUI dropdown for explicit ascending/descending sorting and hiding. The Kolom menu restores hidden columns; at least one column remains visible. Display-only action columns expose visibility controls without meaningless sorting.

Use `DropdownButton` with `Dropdown` for a styled menu trigger: it composes DropdownTrigger with the shared Button sizing and secondary recipe, plus a neutral ghost treatment, retains the open background, and rotates its chevron from the Dropdown state. Keep menu open/closed state local to each trigger so toggling does not rerender the table. It inherits outside dismissal, Escape and focus management, and respects reduced motion. Keep the existing DropdownPopover for the menu surface and animation.

## Data visualization and AI output

`src/components/application/data-viz/` holds the shared data displays. They are internal application compositions, not catalog exports, because the catalog files are protected design-system files. Use them instead of calling Recharts directly:

| Component | Use for |
| --- | --- |
| `ChartCard` | Frame for any data display: title, context line, badges, empty/loading states, and a Grafik/Tabel switch when given a `table`. |
| `TimeSeriesChart`, `SeriesTable` | One measure over time (`line` or `bar`), with an optional labelled reference line such as the regional value. |
| `CategoryBarChart`, `CategoryTable` | Comparing named items, e.g. regional scores; values are printed at the bar ends. |
| `StatValue`, `GaugeMeter`, `StatusValue` | A headline number with change and sparkline; a value inside a real range (never an invented threshold); a text/boolean state as a labelled `StatusBadge`. |
| `LocationMap`, `ValueTable` | One coordinate pair; any key/value or tabular readout. |
| `SensorWidget`, `SensorWidgetGrid` | Render `GET /me/dashboard` directly. The backend layout (Gemini, or rules as fallback) picks each field's `widget`; the component maps it to the displays above and groups fields per device and layout group. |

Series colors come from `--color-series-1..5` in `series.css`, in fixed order. BoardUI's `chart-1..9` order fails colorblind separation, so the series order was re-derived from the same ramps and validated for light and dark surfaces; light contrast is below 3:1, which is why charts keep text values and a table view. Do not cycle or reorder series colors.

AI answers render through `agent-chat/api-answer.tsx`: `MarkdownText` turns model output into React elements (no HTML), `VizRenderer` maps each `viz` item (`ranking`, `region_card`, `event_map`, `alerts`) to the components above, and a `fallback` reason from the backend is shown as a plain-language notice when the answer was built without Gemini.
