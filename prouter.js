// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// prouter v0.1.0
// https://github.com/jakelazaroff/prouter

/** @import { AnyComponent, VNode } from "preact"; */
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
 * @property {AnyComponent} component
 * @property {Route<any, any>[] | LazyChildren | Promise<Route<any, any>[]>} children
 * @property {AnyComponent} [fallback]
 * @property {any} [error]
 * @property {Params} [_params] - phantom field for type inference, not used at runtime
 */

/**
 * @template [TParent={}]
 * @typedef {object} RouteOptions
 * @property {AnyComponent} component
 * @property {AnyComponent} [fallback]
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

/** @extends {Component<{fallback: any, children: any}>} */
class Boundary extends Component {
  /** @param {any} err */
  __c(err) {
    if (!err || typeof err.then !== "function") throw err
    err.then(() => this.setState({p: null}), () => this.setState({p: null}))
  }

  render() {
    return this.state.p ? this.props.fallback : this.props.children
  }
}

const MODE_HYDRATE = 1 << 5
const _catchError = options.__e
options.__e = (err, newVNode, oldVNode) => {
  if (err && err.then) {
    let v = newVNode
    while ((v = v.__)) {
      if (v.__c instanceof Boundary) {
        if (newVNode.__e == null) {
          newVNode.__e = oldVNode.__e
          newVNode.__k = oldVNode.__k
        }
        const c = v.__c
        if (newVNode.__u & MODE_HYDRATE) return
        c.setState({p: err})
        c.__c(err, newVNode)
        return
      }
    }
  }
  if (_catchError) _catchError(err, newVNode, oldVNode)
}

/** @param {{route: Route<any, any>, segments: string[], index: number, params: Record<string, string>, query: Record<string, string>}} props */
function Resolver(props) {
  const {route: r, segments, index, params, query} = props
  const {children} = r
  if (typeof children === "function") {
    r.children = children()
    throw r.children
  }
  if (children instanceof Promise) throw children
  const matches = match(children, segments, index)
  if (!matches.length) return null
  for (const m of matches) Object.assign(params, m.params)
  let child = null
  for (const {route: mr} of [...matches].reverse()) {
    child = child ? h(mr.component, {params, query}, child) : h(mr.component, {params, query})
  }
  return child
}

/** @extends {Component<{route: Route<any, any>, url?: string}>} */
export class Router extends Component {
  /** @type {RouterContextValue} */
  #ctx = {
    preload: path =>
      this.#load((path.split("?")[0] ?? "").split("/").filter(Boolean)).catch(() => {}),
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

  /** @param {string[]} segments */
  async #load(segments) {
    while (true) {
      // find deepest match
      const deepest = match([this.props.route], segments).at(-1)
      if (!deepest) return

      // if deepest child has been loaded, bail out
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

  render() {
    const url = this.props.url ?? source.read()
    const [pn = "", s] = url.split("?")
    const segments = pn.split("/").filter(Boolean)

    const query = Object.fromEntries(new URLSearchParams(s))
    const matches = match([this.props.route], segments)

    const deepest = matches.at(-1)
    if (!deepest) return null

    const {children} = deepest.route
    if (typeof children === "function") {
      this.#load(segments)
        .then(() => this.setState({}))
        .catch(() => this.setState({}))
    }

    /** @type {VNode | null} */
    let child = null

    // accumulate all params from root to leaf
    const params = {}
    for (const m of matches) Object.assign(params, m.params)

    // compute consumed index (segments consumed by all matches)
    let consumedIndex = 0
    for (const m of matches) {
      consumedIndex += m.route.path?.split("/").filter(Boolean).length ?? 0
    }

    // build vnode tree
    const loading = typeof children === "function" || deepest.route.children instanceof Promise
    for (const {route: r} of matches.reverse()) {
      const props = /** @type {Record<string, any>} */ ({
        params: params,
        query
      })

      if (r === deepest.route && loading) {
        if (deepest.route.error) {
          props.error = deepest.route.error
          child = h(r.component, props)
        } else {
          const fallback = r.fallback ? h(r.fallback, {params, query}) : null
          child = h(
            r.component,
            props,
            h(
              Boundary,
              {fallback},
              h(Resolver, {
                route: r,
                segments,
                index: consumedIndex,
                params: {...params},
                query
              })
            )
          )
        }
      } else {
        child = child ? h(r.component, props, child) : h(r.component, props)
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
    try { deepest.route.children = await deepest.route.children }
    catch (err) { deepest.route.children = children; deepest.route.error = err; throw err }
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
