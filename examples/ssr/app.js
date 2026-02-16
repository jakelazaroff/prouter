import { h } from "preact"
import { layout, route, NavLink } from "prouter"

function Shell(props) {
  return h("div", null,
    h("nav", null,
      h(NavLink, { exact: true }, h("a", { href: "/examples/ssr/" }, "Home")),
      h(NavLink, null, h("a", { href: "/examples/ssr/about" }, "About"))
    ),
    props.children
  )
}

function Home() {
  return h("div", null,
    h("h1", null, "Home"),
    h("p", null, "This page was server-rendered by a service worker.")
  )
}

function About() {
  return h("div", null,
    h("h1", null, "About"),
    h("p", null, "SSR streaming with hydration — no build step needed.")
  )
}

export const root = layout({ component: Shell }, [
  route({ component: Home }),
  route("about", { component: About })
])
