import { h } from "preact"
import { useEffect, useState } from "preact/hooks"
import { layout, route, NavLink } from "prouter"

const _initialPath = typeof location !== "undefined" ? location.pathname : null

function Layer({ name, children }) {
  const [state, setState] = useState(location.pathname === _initialPath ? "ssr" : "client")
  useEffect(() => { if (state === "ssr") setState("hydrated") }, [])
  return h("div", { class: "layer", "data-state": state },
    h("span", { class: "layer-tag" }, name, " — ", state),
    children
  )
}

function Shell(props) {
  const [count, setCount] = useState(0)
  return h(Layer, { name: "Shell" },
    h("nav", null,
      h(NavLink, { exact: true }, h("a", { href: "/examples/ssr/" }, "Home")),
      h(NavLink, null, h("a", { href: "/examples/ssr/settings/profile" }, "Profile")),
      h(NavLink, null, h("a", { href: "/examples/ssr/settings/billing" }, "Billing"))
    ),
    h("p", null, "This page was server-rendered by a service worker. Click the counter — it stays interactive while settings routes lazy-load."),
    h("button", { onClick: () => setCount(count + 1) }, "Count: " + count),
    props.children
  )
}

function Home() {
  return h(Layer, { name: "Home" },
    h("h1", null, "Home")
  )
}

function Settings(props) {
  return props.children
}

function Spinner() {
  return h("p", { class: "spinner" }, "Loading…")
}

function Profile() {
  return h(Layer, { name: "Profile" },
    h("h2", null, "Profile"),
    h("p", null, "Edit your profile settings here.")
  )
}

function Billing() {
  return h(Layer, { name: "Billing" },
    h("h2", null, "Billing"),
    h("p", null, "Manage your billing and payment methods.")
  )
}

function lazySettings() {
  return new Promise(resolve =>
    setTimeout(
      () => resolve([
        route("profile", { component: Profile }),
        route("billing", { component: Billing })
      ]),
      1500
    )
  )
}

export const root = layout({ component: Shell }, [
  route({ component: Home }),
  route("settings", { component: Settings, fallback: Spinner }, lazySettings)
])
