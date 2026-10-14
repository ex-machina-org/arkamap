# Frontend context

Start at [Contributing](../../CONTRIBUTING.md) for the workflow and checks. This index routes frontend implementation detail. Source paths and npm commands in `docs/frontend/` are relative to `frontend/`.

| Need | Read |
| --- | --- |
| Decide where code belongs | [Architecture](./ARCHITECTURE.md) |
| Choose colors, surfaces, typography | [Design system](./DESIGN-SYSTEM.md) |
| Choose a component or extend one | [Components](./COMPONENTS.md) |
| Verify states, themes, responsive behavior | [UI checklist](./UI-CHECKLIST.md) |
| Run local checks | [Contributing](../../CONTRIBUTING.md) |

The live catalog is `/design-system`. Its registry is `src/app/design-system/registry.ts`. Each entry points to its implementation. The catalog's Markdown export includes source paths and the actual source files; a single exported module does not necessarily contain every transitive dependency.
