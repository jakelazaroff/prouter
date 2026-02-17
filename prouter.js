// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// prouter v0.1.0
// https://github.com/jakelazaroff/prouter

/** @import { AnyComponent, ComponentChildren, VNode } from "preact"; */
import {Component, cloneElement, createContext, h, options} from "preact"

/**
 * Extracts param names from a route path string.
 * e.g. "posts/:id" → { id: string }, ":category/:id" → { category: string, id: string }
 *
 * @template {string} T
 * @typedef {T extends `${string}:${infer P}/${infer Rest}`
 *   ? Record<P, string> & ParamsFromPath<Rest>
 *   : T extends `${string}:${infer P}`
 *     ? Record<P, string>
 *     : {}} ParamsFromPath
 */

/** @typedef {() => Promise<Route<any, any>[]>} LazyChildren */

/**
 * @template {string} [P=string]
 * @template [Params=ParamsFromPath<P>]
 * @typedef {object} Route
 * @property {P} [path]
 * @property {AnyComponent<RouteProps>} component
 * @property {Route<any, any>[] | LazyChildren | Promise<Route<any, any>[]>} children
 * @property {AnyComponent<RouteProps>} [fallback]
 * @property {any} [error]
 * @property {Params} [_params] - phantom field for type inference, not used at runtime
 */

/**
 * @template [TParent={}]
 * @typedef {object} RouteOptions
 * @property {AnyComponent<RouteProps>} component
 * @property {AnyComponent<RouteProps>} [fallback]
 * @property {() => Route<any, TParent>} [parent]
 */

/**
 * @template {string} P
 * @template [TParent={}]
 * @overload
 * @param {P} path
 * @param {RouteOptions<TParent>} options
 * @param {Route<any, any>[] | LazyChildren} [children]
 * @returns {Route<P, ParamsFromPath<P> & TParent>}
 */
/**
 * @overload
 * @param {RouteOptions} options
 * @returns {Route<"", {}>}
 */
/**
 * @param {string | RouteOptions} path
 * @param {RouteOptions} [options]
 * @param {Route<any, any>[] | LazyChildren} [children]
 * @returns {Route<any, any>}
 */
export function route(path, options, children = []) {
  let p = /** @type {string | undefined} */ (path),
    opts = /** @type {RouteOptions} */ (options)
  if (typeof path !== "string") {
    p = undefined
    opts = path
  }

  const {component, fallback} = opts

  // "index" routes with no path match all remaining
  if (!p) return {path: undefined, component, fallback, children: []}

  // "normal" routes match a path
  return {path: p, component, fallback, children}
}

/**
 * @param {RouteOptions} options
 * @param {Route<any, any>[]} children
 * @returns {Route<"", {}>}
 */
export function layout({component, fallback}, children) {
  return {path: undefined, component, fallback, children}
}

/**
 * @typedef {object} RouterContextValue
 * @property {(path: string) => Promise<void>} preload
 * @property {(to: string, options?: {replace?: boolean}) => void} navigate
 */

export const RouterContext = createContext(
  /** @type {RouterContextValue} */ ({
    preload: () => Promise.resolve(),
    navigate
  })
)

/**
 * @template {Route<any, any>} [R=Route<any, any>]
 * @typedef {object} RouteProps
 * @prop {NonNullable<R["_params"]>} params
 * @prop {Record<string, string>} query
 * @prop {any} [error]
 */

/**
 * @typedef {object} Source
 * @property {() => string} read
 * @property {(url: string, replace?: boolean) => void} write
 */

let base = ""

/** @type {Source} */
export const pathname = {
  read: () => {
    const p = location.pathname
    const path = base && p.startsWith(base) ? p.slice(base.length) || "/" : p
    return path + location.search
  },
  write: (url, replace) => {
    const full = base + url
    replace ? history.replaceState(null, "", full) : history.pushState(null, "", full)
  }
}

/** @type {Source} */
export const hash = {
  read: () => location.hash.slice(1) || "/",
  write: (url, replace) =>
    replace ? history.replaceState(null, "", `#${url}`) : history.pushState(null, "", `#${url}`)
}

/** @type {Source} */
let source = pathname

/** @type {Set<Component>} */
const subscribers = new Set()

function notify() {
  for (const c of subscribers) c.forceUpdate()
}

/** @param {MouseEvent} e */
function handleClick(e) {
  if (e.defaultPrevented) return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  if (e.button !== 0) return

  const link = /** @type {HTMLAnchorElement | null} */ (
    /** @type {HTMLElement} */ (e.target).closest("a[href]")
  )
  if (!link) return

  const url = new URL(link.href, location.origin)
  if (url.origin !== location.origin) return

  e.preventDefault()
  let path = url.pathname + url.search
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/"
  navigate(path)
}

/**
 * @param {object} [options]
 * @param {Source} [options.source]
 * @param {string} [options.base]
 */
export function init(options) {
  if (options?.base) base = options.base.replace(/\/$/, "")
  if (options?.source) source = options.source

  if (typeof addEventListener !== "undefined") {
    addEventListener("click", handleClick)
    addEventListener("auxclick", handleClick)
    addEventListener("popstate", notify)
  }
}

/**
 * @param {string} to
 * @param {{ replace?: boolean }} [options]
 */
export function navigate(to, options) {
  source.write(to, options?.replace)
  notify()
}

/**
 * @typedef {object} NavLinkProps
 * @prop {boolean} [exact]
 */

/** @extends {Component<NavLinkProps>} */
export class NavLink extends Component {
  /** @override */
  componentDidMount() {
    subscribers.add(this)
  }

  /** @override */
  componentWillUnmount() {
    subscribers.delete(this)
  }

  render() {
    const {exact} = this.props
    const child = /** @type {VNode} */ (this.props.children)
    const href = /** @type {string} */ (child.props.href)
    const [url = ""] = source.read().split("?")
    const urlSegs = url.split("/").filter(Boolean)
    const hrefSegs = href.split("/").filter(Boolean)

    let active = hrefSegs.length <= urlSegs.length
    if (active) {
      for (let i = 0; i < hrefSegs.length; i++) {
        if (hrefSegs[i] !== urlSegs[i]) {
          active = false
          break
        }
      }
    }
    if (active && exact) active = hrefSegs.length === urlSegs.length

    return active ? cloneElement(child, {"data-active": ""}) : child
  }
}

/**
 * @typedef {object} InternalComponent
 * @property {(err: any, vnode: InternalVNode) => void} [__c] _childDidSuspend
 * @property {InternalVNode} [__v] _vnode
 */

/**
 * @typedef {object} InternalVNode
 * @property {InternalVNode} [__] _parent
 * @property {InternalComponent} [__c] _component
 * @property {Element | Text} [__e] _dom
 * @property {InternalVNode[]} [__k] _children
 * @property {number} [__u] _flags
 * @property {boolean} [__h] _hydrating
 */

/**
 * @typedef {object} InternalOptions
 * @property {(err: any, next: InternalVNode, prev: InternalVNode, info: any) => void} __e
 */

const opts = /** @type {InternalOptions} */ (options),
  oldCatch = opts.__e

class SuspendError extends Error {
  then() {}
}

/**
 * A minimal Suspense implementation mostly cribbed from https://github.com/JoviDeCroock/preact-suspense
 * @param {any} err
 * @param {InternalVNode} next
 * @param {InternalVNode} prev
 * @param {any} info
 */
opts.__e = (err, next, prev, info) => {
  if (err instanceof SuspendError) {
    // walk up vnode tree until we find a suspense boundary
    let v = next
    while (v.__) {
      v = v.__
      if (!v.__c?.__c) continue

      // preserve DOM references so we don't lose existing content
      if (next.__e == null) {
        next.__e = prev.__e
        next.__k = prev.__k
      }

      // delegate to the suspense boundary's _childDidSuspend
      return v.__c.__c(err, next)
    }
  }

  oldCatch?.(err, next, prev, info)
}

const MODE_HYDRATE = 1 << 5

/**
 * A minimal Suspense boundary, also mostly cribbed from preact-suspense,
 * but idiosyncratic and in to this library rather than for general usage.
 * @extends {Component<{route: Route, fallback: ComponentChildren, onLoad: () => void}>}
 */
class Boundary extends Component {
  /**
   * __c is the marker preact-render-to-string checks for SSR streaming
   * @param {any} _err
   * @param {InternalVNode} vnode
   */
  __c(_err, vnode) {
    if ((vnode.__u ?? 0) & MODE_HYDRATE || vnode.__h) return
    this.forceUpdate()
  }

  static Suspend = () => {
    throw new SuspendError()
  }

  render() {
    const {route, fallback, onLoad} = this.props

    if (typeof route.children === "function") {
      const load = route.children
      route.children = load()
      route.children
        .then(resolved => {
          route.children = resolved
        })
        .catch(err => {
          route.children = load
          route.error = err
        })
        .finally(onLoad)
      return h(Boundary.Suspend, null)
    }

    return fallback ?? null
  }
}

/** @extends {Component<{route: Route, url?: string}>} */
export class Router extends Component {
  /** @type {RouterContextValue} */
  #ctx = {
    preload: path => preload(this.props.route, path).catch(() => {}),
    navigate
  }

  /** @override */
  componentDidMount() {
    if (!this.props.url) subscribers.add(this)
  }

  /** @override */
  componentWillUnmount() {
    subscribers.delete(this)
  }

  render() {
    const url = this.props.url ?? source.read()
    const [pn = "", s] = url.split("?")
    const segments = pn.split("/").filter(Boolean)

    const query = Object.fromEntries(new URLSearchParams(s))

    // find all matching routes
    const matches = match([this.props.route], segments)
    if (!matches.length) return null

    // collect all params
    const params = /** @type {Record<string, string>} */ ({})
    for (const m of matches) Object.assign(params, m.params)

    // iterate through the matched routes from leaf to root, wrapping each one in its parent
    let child = /** @type {VNode | null} */ (null)
    for (let i = matches.length - 1; i >= 0; i--) {
      const {route: r} = /** @type {RouteMatch} */ (matches[i])

      if (r.error) {
        // if we encountered an error loading the route, show the parent route with the error
        child = h(r.component, {params, query, error: r.error})
      } else if (typeof r.children === "function" || r.children instanceof Promise) {
        // otherwise, if the route is suspending, show the boundary with fallback
        const fallback = r.fallback ? h(r.fallback, {params, query}) : null
        const onLoad = () => this.setState({})
        child = h(r.component, {params, query}, h(Boundary, {route: r, fallback, onLoad}))
      } else {
        // otherwise, just show the route
        child = child ? h(r.component, {params, query}, child) : h(r.component, {params, query})
      }
    }

    return h(RouterContext.Provider, {value: this.#ctx}, child)
  }
}

/**
 * @template {string} [P=string]
 * @template [Params=ParamsFromPath<P>]
 * @typedef {object} RouteMatch
 * @property {Route<P, Params>} route
 * @property {Params} params
 */

/**
 * Preload a path, recursively loading any lazily-loaded routes.
 * @param {Route<any, any>} root
 * @param {string} path
 */
export async function preload(root, path) {
  const segments = (path.split("?")[0] ?? "").split("/").filter(Boolean)
  while (true) {
    const deepest = match([root], segments).at(-1)
    if (!deepest) return

    const {children} = deepest.route
    if (typeof children !== "function") return

    deepest.route.children = children()
    try {
      deepest.route.children = await deepest.route.children
    } catch (err) {
      deepest.route.children = children
      deepest.route.error = err
      throw err
    }
  }
}

/**
 * @param {Route<any, any>[]} routes
 * @param {string[]} segments
 * @param {number} [index]
 * @returns {RouteMatch<any, any>[]}
 */
export function match(routes, segments, index = 0) {
  rte: for (const r of routes) {
    // break route path into segments
    const pathSegments = r.path?.split("/").filter(Boolean) ?? []

    // if there are more path segments than remaining route segments, there's no match
    if (pathSegments.length > segments.length + index) return []

    /** @type {Record<string, string>} */
    const params = {}

    // iterate through the path segments
    for (let i = 0; i < pathSegments.length; i++) {
      // get the corresponding path and url segment
      const pathSeg = pathSegments[i]
      const urlSeg = segments[index + i]

      // if the path segment is a param, set the param
      if (pathSeg.startsWith(":")) params[pathSeg.slice(1)] = urlSeg ?? ""
      // otherwise, if the path and route don't match, continue with the next route
      else if (pathSeg !== urlSeg) continue rte
    }

    const next = index + pathSegments.length

    // if children are lazy (function or promise), return partial match
    if (typeof r.children === "function" || r.children instanceof Promise) {
      if (next <= segments.length) return [{route: r, params}]
    } else if (r.children.length) {
      const child = match(r.children, segments, next)
      if (child.length) return [{route: r, params}].concat(child)
    }

    // if this route is the last, return the route
    if (next === segments.length) return [{route: r, params}]
  }

  return []
}
