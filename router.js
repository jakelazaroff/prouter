/** @import { AnyComponent, VNode } from "preact"; */
import { Component, h } from "preact";

/**
 * @typedef {object} Route
 * @property {string} [path]
 * @property {AnyComponent} component
 * @property {Route[]} children
 */

/**
 * @typedef {object} RouteOptions
 * @property {AnyComponent} component
 */

/**
 * @overload
 * @param {string} path
 * @param {RouteOptions} options
 * @param {Route[]} [children]
 * @returns {Route}
 */
/**
 * @overload
 * @param {RouteOptions} options
 * @returns {Route}
 */
/**
 * @param {string | RouteOptions} path
 * @param {RouteOptions} [options]
 * @param {Route[]} [children]
 * @returns {Route}
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
 * @param {Route[]} children
 * @returns {Route}
 */
export function layout(options, children) {
	return { path: undefined, component: options.component, children };
}

/** @extends {Component<{ route: Route, url: string }>} */
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
 * @typedef {object} RouteMatch
 * @property {Route} route
 * @property {Record<string, string>} params
 */

/**
 * @param {Route[]} routes
 * @param {string[]} segments
 * @param {number} [index]
 * @returns {RouteMatch[]}
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
