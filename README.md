# prouter

A tiny type-safe Suspense-compatible router for Preact in a single vanilla JavaScript file.

3.8kb unminified and gzipped! 1.5kb minified and gzipped! Zero dependencies other than Preact!

> **Note:** prouter is new; the API is very subject to change!

## Install

prouter is not on npm; instead, it's meant to be [vendored](https://htmx.org/essays/vendoring/), or copied directly into your project's source code.

Don't be put off — prouter.js a single ~450 line file, of which only ~200 lines are actually JavaScript code. It doesn't bite!

## Quick start

```jsx
import { render } from "preact";
import { index, init, layout, route, Router } from "./prouter.js";

function Shell(props) {
  return <div>{props.children}</div>;
}
function Home() {
  return <p>home</p>;
}
function About() {
  return <p>about</p>;
}

const root = layout({ component: Shell }, [
  index({ component: Home }),
  route("about", { component: About }, [])
]);

init();
render(<Router route={root} />, document.body);
```

## Defining routes

### `route(path, options, children)`

Creates a route that matches a URL segment.

```js
const posts = route("posts", { component: Posts }, []);
```

### `index(options)`

Creates an "index route" that renders when no further segments remain.

```js
const home = index({ component: Home });
```

### `layout(options, children)`

Creates a pathless layout wrapper. It always matches and renders its component around its children.

```js
const root = layout({ component: Shell }, [
  index({ component: Home }),
  route("about", { component: About }, [])
]);
```

### Nesting

Pass children as the last argument to `route` or `layout` to build a tree of routes.

```js
const root = layout({ component: Shell }, [
  route("posts", { component: Posts }, [route(":id", { component: Post }, [])])
]);
```

## Type-safe params

Route params defined with `:param` syntax are inferred at the type level. Use `RouteProps` in your component to get typed `params` and `query` props. The `parent` option lets child routes accumulate param typees from their ancestors.

```js
const postRoute = route(":id", { component: Post }, []);

/** @param {import("./prouter.js").RouteProps<typeof postRoute>} props */
function Post(props) {
  props.params.id; // string
  props.query; // Record<string, string>
}

const commentRoute = route(":commentId", {
  component: Comment,
  parent: () => postRoute
}, []);

/** @param {import("./prouter.js").RouteProps<typeof commentRoute>} props */
function Comment(props) {
  props.params.id; // string (from parent)
  props.params.commentId; // string
}
```

## Lazy loading

Wrap a component with `lazy()` to load it on demand. Pass a function that returns a promise resolving to the component:

```js
import { index, lazy, layout, route } from "./prouter.js";

const Settings = lazy(() =>
  import("./Settings.js").then(mod => mod.default)
);

const root = layout({ component: Shell }, [
  index({ component: Home }),
  route("settings", { component: Settings, fallback: Spinner }, [
    route("profile", { component: Profile }, []),
    route("billing", { component: Billing }, [])
  ])
]);
```

The route tree is always defined statically; only the component is lazy. When the router matches a route with a lazy component, it shows the `fallback` (if provided) while loading, then re-renders with the resolved component. If multiple lazy components appear along a matched path, they all load in parallel.

## Preloading

Use `RouterContext` to preload lazy components ahead of time — for example, on hover or focus:

```jsx
import { useContext } from "preact/hooks";
import { RouterContext } from "./prouter.js";

function NavItem({ href, children }) {
  const { preload } = useContext(RouterContext);
  return (
    <a href={href} onMouseEnter={() => preload(href)}>
      {children}
    </a>
  );
}
```

`preload` resolves all lazy components along the matched path in parallel.

## Navigation

### `init([options])`

Call once at startup. Registers click and popstate handlers for client-side navigation.

```js
init();
```

### `navigate(to, [options])`

Programmatic navigation. Pass `{ replace: true }` to replace the current history entry.

```js
navigate("/about");
navigate("/login", { replace: true });
```

### `NavLink`

Wraps a child `<a>` element and adds a `data-active` attribute when the current URL matches the child's `href`. Use `exact` to require a full match.

```jsx
<NavLink>
  <a href="/posts">Posts</a>
</NavLink>

<NavLink exact>
  <a href="/">Home</a>
</NavLink>
```

Style active links with CSS:

```css
[data-active] {
  font-weight: bold;
}
```

## URL sources

By default, the router reads from `location.pathname`. Pass a different source to `init` for hash-based routing:

```js
import { init, hash } from "./prouter.js";

init({ source: hash });
```

The built-in sources are:

- **`pathname`** — uses `location.pathname` + `location.search` and the History API (default)
- **`hash`** — uses `location.hash` and the History API

You can also provide a custom source implementing `read()` and `write(url, replace?)`.

## Server-side rendering

Pass a `url` prop to `Router` to render a specific URL without relying on browser globals:

```jsx
<Router route={root} url="/about" />
```

Lazy components use a Suspense-compatible boundary, so `preact-render-to-string` can stream HTML for lazy routes and the client can hydrate them progressively. Call `preload()` before rendering to resolve lazy components on the server and avoid the fallback entirely.
