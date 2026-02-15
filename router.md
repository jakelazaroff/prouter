# Router2 Design Notes

## Goals
- No suspense
- Load nested routes without waterfalls
- Store and narrow typed context within subtrees

## Key Design Decisions

### Routes as data, not JSX
`route()` builds a static tree. This lets you walk the entire matched branch before rendering, enabling parallel data loading (no waterfalls).

### API
- `route(path, { component }, children?)` — returns `{ path, component, children }`
- Paths are relative segments: `"about"`, `"posts"`, `":id"`
- `""` (empty string) = index route / root layout (consumes zero segments)
- No leading `/` on nested routes (it's noise since they're always relative)
- `match([routes], segments)` takes an array of routes, not a single root

### Root route
Using `route("", ...)` for the root. It's the same matching logic as an index route (consumes nothing), but has children. Keeping it because it can set up context later.

### Match function
Recursive. Takes `(routes, segments, index)`. Returns array of `{ route, params }` for the matched branch, or `[]` if no match.

Logic per route (no special cases for "/"):
1. Parse `route.path` into segments (`"".split("/").filter(Boolean)` → `[]`)
2. Try matching each route segment against `segments[index..]` — literal = exact, `:param` = capture
3. Advance: `nextIndex = index + routeSegs.length`
4. If has children → recurse into children with nextIndex. First child match wins.
5. If leaf → only matches if `nextIndex === segments.length`
6. Return `[]` if nothing matched

### Context / beforeLoad (deferred)
Two-phase approach planned:
- **Phase 1 (sequential, top-down):** `beforeLoad` runs guards/assertions. E.g., assert user exists, redirect if not. This is where context narrows types (e.g., `User | null` → `User`).
- **Phase 2 (parallel):** Data loaders run in parallel once guards pass.

The waterfall to avoid is in phase 2, not phase 1. Sequential guards are fine since they're fast checks.

### Things we decided against
- URLPattern / RegExp routers: designed for flat route tables, not nested tree matching
- `*` wildcard: equivalent to `:param` (matches one segment), probably don't need both
- Query string matching: keep separate from route matching, read in components or validate in beforeLoad

## Current State
- `route()` and basic `Router`/`Outlet` stubbed in `router.js`
- `match()` partially implemented — needs update to use `""` instead of `"/"` and take an array
- Tests in `router.js` — need updating to match new API (`""`, `match([root], segments)`, return `{ route, params }` tuples)
