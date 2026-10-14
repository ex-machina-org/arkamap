# Frontend architecture

## Responsibilities

```text
src/App.tsx                    route dispatch and global providers
src/app/<route>/page.tsx        route composition, route-local wiring
src/features/<feature>/        domain components, hooks, data, types, transformations
src/components/application/    reusable application patterns and shells
src/components/base/           BoardUI controls
src/components/ui/             capability gaps and earlier JOINTS compositions
src/components/foundations/    shared visual foundations
src/hooks/                     shared reactive behavior
src/lib/, src/utils/           shared pure utilities and compatibility helpers
src/styles/                    BoardUI theme, typography, global styles
src/boardui-compat/            Vite adapters for BoardUI's Next.js imports
```

The `app` directory is a Vite route convention, not a Next.js runtime. Current routing is implemented in `App.tsx`; adding a page alone does not create a route.

## Dependency direction

Pages may consume features and shared layers. Features may consume shared layers but must not import pages or another feature's internal implementation. Shared components must not import features or pages. Base controls and foundations must not depend on application components. Shared hooks/utilities must not depend on product routes, features, or components.

`npm run architecture:check` resolves local imports with TypeScript's resolver, including aliases, relative imports, re-exports, and literal dynamic imports. Its one named exception is `ui/kpi-card.tsx -> application/dashboard/stat-cards.tsx`: this existing composition predates the folder contract. Do not add exceptions for convenience. Fix the responsibility or document a necessary migration explicitly.

`components/ui` currently contains both primitives and composites. It may compose BoardUI base controls. New reusable composites belong in `components/application`, rather than growing the mixed layer.

## Feature organization

Create only folders needed by the change:

```text
features/<feature>/
  components/        domain UI with its own responsibility
  hooks/             domain state and effects
  data.ts            explicitly simulated fixtures or domain constants
  types.ts           shared types within this feature
  utils.ts           pure domain transformations
```

Use the environmental dashboard feature as an incremental migration example. Existing routes may still contain domain logic; move it when that responsibility is actually changed. Do not perform mass moves for naming consistency.

Split a unit when it combines unrelated lifecycle/state coordination or independent UI sections. Line count is a review signal, not a mechanical split rule. The dashboard workspace remains a large unit requiring further responsibility-based extraction as its workflows evolve.

## State and integration

Keep local interaction state near its owner. Shared app state needs an identified cross-route consumer before adding a provider or store. A component demo is not an API contract. Validate external data at the integration boundary when real services are introduced; no validation dependency is required for local typed fixtures.

Before adding routing, persistence, or a backend, consult the approved product scope and identify the actual integration owner. Do not implement speculative service contracts.
