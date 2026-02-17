# prouter

A tiny, type-safe router for Preact in a single vanilla JavaScript file.

3.1kb unminified and gzipped! 1.4kb minified and gzipped! Zero dependencies other than Preact!

> **Note:** prouter is new; the API is very subject to change!

## Install

prouter is not on npm; instead, it's meant to be [vendored](https://htmx.org/essays/vendoring/), or copied directly into your project's source code.

Don't be put off — prouter.js a single ~450 line file, of which only ~200 lines are actually JavaScript code. It doesn't bite!

## Quick start

```jsx
import { render } from "preact";
import { init, route, layout, Router } from "./prouter.js";

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
  route({ component: Home }),
  route("about", { component: About })
]);

init();
render(<Router route={root} />, document.body);
```

## Defining routes

### `route(path, options, [children])`

Creates a route that matches a URL segment.

```js
const posts = route("posts", { component: Posts });
```

### `route(options)`

Creates an "index route" that renders when no further segments remain.

```js
const home = route({ component: Home });
```

### `layout(options, children)`

Creates a pathless layout wrapper. It always matches and renders its component around its children.

```js
const root = layout({ component: Shell }, [
  route({ component: Home }),
  route("about", { component: About })
]);
```

### Nesting

Pass children as the last argument to `route` or `layout` to build a tree of routes.

```js
const root = layout({ component: Shell }, [
  route("posts", { component: Posts }, [route(":id", { component: Post })])
]);
```

## Type-safe params

Route params defined with `:param` syntax are inferred at the type level. Use `RouteProps` in your component to get typed `params`, `query`, `loading`, and `error` props. The `parent` option lets child routes accumulate params from their ancestors.

```js
const postRoute = route(":id", { component: Post });

/** @param {import("./prouter.js").RouteProps<typeof postRoute>} props */
function Post(props) {
  props.params.id; // string
  props.query; // Record<string, string>
}

const commentRoute = route(":commentId", {
  component: Comment,
  parent: () => postRoute
});

/** @param {import("./prouter.js").RouteProps<typeof commentRoute>} props */
function Comment(props) {
  props.params.id; // string (from parent)
  props.params.commentId; // string
}
```

## Lazy loading

Pass a function that returns a promise of child routes to create a lazy boundary:

```js
const root = layout({ component: Shell }, [
  route("settings", { component: Settings }, () =>
    import("./settings-routes.js").then(mod => mod.routes)
  )
]);
```

The imported module just needs to export an array of routes:

```js
// settings-routes.js
export const routes = [
  route({ component: SettingsHome }),
  route("profile", { component: Profile })
];
```

When the router hits a lazy boundary, the component receives `loading: true` as a prop. On failure, it receives `error` with the thrown value.

```jsx
function Settings(props) {
  if (props.loading) return <p>loading...</p>;
  return <div>{props.children}</div>;
}
```

## Preloading

Use `RouterContext` to preload routes ahead of time — for example, on hover or focus:

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

If there are nested lazy boundaries, they will all be preloaded. Note that nested lazy boundaries must be resolved _sequentially_, so it's best to avoid this.

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

Internal `<a>` clicks are intercepted automatically — no special link component needed. Modifier clicks (ctrl, meta, alt, shift) and external links are left alone.

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
