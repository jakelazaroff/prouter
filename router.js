/** @import { AnyComponent, VNode } from "preact"; */
import { Component, h } from "preact";

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

/**
 * @template {string} [P=string]
 * @template [Params=ParamsFromPath<P>]
 * @typedef {object} Route
 * @property {P} [path]
 * @property {AnyComponent} component
 * @property {Route<any, any>[]} children
 * @property {Params} [_params] - phantom field for type inference, not used at runtime
 */

/**
 * @typedef {object} RouteOptions
 * @property {AnyComponent} component
 */

/**
 * @template {string} P
 * @overload
 * @param {P} path
 * @param {RouteOptions} options
 * @param {Route<any, any>[]} [children]
 * @returns {Route<P>}
 */
/**
 * @overload
 * @param {RouteOptions} options
 * @returns {Route<"", {}>}
 */
/**
 * @param {string | RouteOptions} path
 * @param {RouteOptions} [options]
 * @param {Route<any, any>[]} [children]
 * @returns {Route<any, any>}
 */
export function route(path, options, children = []) {
	if (typeof path === "string")
		return {
			path,
			component: /** @type {RouteOptions} */ (options).component,
			children,
		};

	return { path: undefined, component: path.component, children: [] };
}

/**
 * @param {RouteOptions} options
 * @param {Route<any, any>[]} children
 * @returns {Route<"", {}>}
 */
export function layout(options, children) {
	return { path: undefined, component: options.component, children };
}

/** @extends {Component<{ route: Route<any, any>, url: string }>} */
export class Router extends Component {
	render() {
		const segments = this.props.url.split("/").filter(Boolean);
		const matches = match([this.props.route], segments);

		/** @type {VNode | null} */
		let child = null;

		for (const { route: r, params } of matches.reverse()) {
			const props = Object.keys(params).length ? params : null;
			child = child ? h(r.component, props, child) : h(r.component, props);
		}

		return child;
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
 * @param {Route<any, any>[]} routes
 * @param {string[]} segments
 * @param {number} [index]
 * @returns {RouteMatch<any, any>[]}
 */
export function match(routes, segments, index = 0) {
	rte: for (const r of routes) {
		// break route path into segments
		const pathSegments = r.path?.split("/").filter(Boolean) ?? [];

		// if there are more path segments than remaining route segments, there's no match
		if (pathSegments.length > segments.length + index) return [];

		/** @type {Record<string, string>} */
		const params = {};

		// iterate through the path segments
		for (let i = 0; i < pathSegments.length; i++) {
			// get the corresponding path and url segment
			const pathSeg = pathSegments[i];
			const urlSeg = segments[index + i];

			// if the path segment is a param, set the param
			if (pathSeg.startsWith(":")) params[pathSeg.slice(1)] = urlSeg;
			// otherwise, if the path and route don't match, continue with the next route
			else if (pathSeg !== urlSeg) continue rte;
		}

		const next = index + pathSegments.length;

		// if there are children, append any matching child routes
		if (r.children.length) {
			const child = match(r.children, segments, next);
			if (child.length) return [{ route: r, params }].concat(child);
		}

		// if this route is the last, return the route
		if (next === segments.length) return [{ route: r, params }];
	}

	return [];
}
