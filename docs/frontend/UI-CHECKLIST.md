# UI completion checklist

Before implementation, identify the component source, token roles, owning feature, and relevant states. Follow [component selection](./COMPONENTS.md) and [architecture](./ARCHITECTURE.md).

- Reuse the documented API; no invented props or variants.
- Verify default, hover, focus-visible, active, disabled, loading, empty, and error states where relevant.
- Verify light and BoardUI dark themes. Check canvas/panel contrast and control edges.
- Check the [surface hierarchy](./DESIGN-SYSTEM.md#surface-hierarchy): panel bodies match KPI bodies, supporting gray stays local, and hover/selected rows remain visible, including sticky cells.
- Check keyboard navigation, accessible names, focus restoration for overlays, and text labels for color-coded states.
- Check representative widths: 320px, the selected layout's breakpoint immediately before/after transition, and 1440px. Avoid horizontal overflow and hidden actions.
- Respect reduced motion; animated feedback must have a purpose.
- Label simulated data and actions. Never imply an unavailable service succeeded.
- Register reusable public components and keep source pointers accurate.
- Run the local checks in [Contributing](../../CONTRIBUTING.md).

The considerations above guide implementation; they do not require a browser testing session. Browser testing, Playwright, QA, and smoke tests run only when explicitly requested. Follow [Contributing](../../CONTRIBUTING.md) for local lint and CI requirements. Report the checks actually performed.
