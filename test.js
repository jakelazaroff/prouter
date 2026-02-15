import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { h } from "preact";

import { layout, match, Router, route } from "./router.js";

const c = () => null;

// Type-level tests: verify param inference at typecheck time
{
	const _paramRoute = route(":id", { component: c });
	/** @type {string} */ const _id = match([_paramRoute], ["42"])[0].params.id;

	const _multiParam = route(":category/:id", { component: c });
	/** @type {string} */ const _cat = match([_multiParam], ["a", "b"])[0].params
		.category;
	/** @type {string} */ const _mid = match([_multiParam], ["a", "b"])[0].params
		.id;

	const _noParams = route("about", { component: c });
	/** @type {{}} */ const _empty = match([_noParams], ["about"])[0].params;

	// Verify Route type still infers params from path
	/** @type {import("./router.js").Route<":id", {id: string}>} */ const _typed =
		_paramRoute;
	/** @type {import("./router.js").Route<":category/:id", {category: string, id: string}>} */ const _multi =
		_multiParam;
	// @ts-expect-error — wrong param shape must be rejected
	/** @type {import("./router.js").Route<":id", {bogus: string}>} */ const _bad =
		_paramRoute;
}

/** Strip preact's internal __v counter so vnodes can be compared structurally. */
function strip(/** @type {any} */ vnode) {
	if (vnode == null || typeof vnode !== "object") return vnode;
	const { __v, ...rest } = vnode;
	if (rest.props?.children)
		rest.props = { ...rest.props, children: strip(rest.props.children) };
	return rest;
}

function assertVNode(/** @type {any} */ actual, /** @type {any} */ expected) {
	assert.deepEqual(strip(actual), strip(expected));
}

describe("match", () => {
	test("matches a root index route", () => {
		const index = route({ component: c });
		const result = match([index], []);
		assert.deepEqual(result, [{ route: index, params: {} }]);
	});

	test("returns an empty array when nothing matches", () => {
		const index = route({ component: c });
		const result = match([index], ["foo"]);
		assert.deepEqual(result, []);
	});

	test("matches a single segment", () => {
		const about = route("about", { component: c });
		const result = match([about], ["about"]);
		assert.deepEqual(result, [{ route: about, params: {} }]);
	});

	test("matches a layout with children", () => {
		const about = route("about", { component: c });
		const root = layout({ component: c }, [about]);
		const result = match([root], ["about"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: about, params: {} },
		]);
	});

	test("matches nested routes", () => {
		const billing = route("billing", { component: c });
		const account = route("account", { component: c }, [billing]);
		const root = layout({ component: c }, [account]);

		const result = match([root], ["account", "billing"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: account, params: {} },
			{ route: billing, params: {} },
		]);
	});

	test("matches :param segments", () => {
		const detail = route(":id", { component: c });
		const posts = route("posts", { component: c }, [detail]);
		const root = layout({ component: c }, [posts]);

		const result = match([root], ["posts", "42"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: posts, params: {} },
			{ route: detail, params: { id: "42" } },
		]);
	});

	test("picks first matching child", () => {
		const alpha = route("alpha", { component: c });
		const beta = route("beta", { component: c });
		const root = layout({ component: c }, [alpha, beta]);

		const result = match([root], ["beta"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: beta, params: {} },
		]);
	});

	test("stops at lazy boundary (function children)", () => {
		const lazyChildren = () => Promise.resolve({ default: [] });
		const parent = route("section", { component: c }, lazyChildren);
		const root = layout({ component: c }, [parent]);

		const result = match([root], ["section", "page"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: parent, params: {} },
		]);
	});

	test("stops at in-progress boundary (promise children)", () => {
		const parent = route("section", { component: c });
		// Simulate in-progress loading by assigning a promise
		/** @type {any} */ (parent).children = Promise.resolve({ default: [] });
		const root = layout({ component: c }, [parent]);

		const result = match([root], ["section", "page"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: parent, params: {} },
		]);
	});

	test("matches nested index route", () => {
		const index = route({ component: c });
		const settings = route("settings", { component: c }, [index]);
		const root = layout({ component: c }, [settings]);

		const result = match([root], ["settings"]);
		assert.deepEqual(result, [
			{ route: root, params: {} },
			{ route: settings, params: {} },
			{ route: index, params: {} },
		]);
	});
});

describe("Router", () => {
	test("renders a leaf route component", () => {
		const Home = () => h("p", null, "home");
		const root = route({ component: Home });

		const tree = new Router({ route: root, url: "/" }).render();
		assertVNode(tree, h(Home, { params: {} }));
	});

	test("renders a layout wrapping a child", () => {
		const Shell = (/** @type {any} */ props) => h("div", null, props.children);
		const About = () => h("p", null, "about");
		const root = layout({ component: Shell }, [
			route("about", { component: About }),
		]);

		const tree = new Router({ route: root, url: "/about" }).render();
		assertVNode(tree, h(Shell, { params: {} }, h(About, { params: {} })));
	});

	test("renders nested layouts", () => {
		const Shell = (/** @type {any} */ props) => h("div", null, props.children);
		const Settings = (/** @type {any} */ props) =>
			h("section", null, props.children);
		const Profile = () => h("p", null, "profile");
		const root = layout({ component: Shell }, [
			route("settings", { component: Settings }, [
				route("profile", { component: Profile }),
			]),
		]);

		const tree = new Router({ route: root, url: "/settings/profile" }).render();
		assertVNode(
			tree,
			h(
				Shell,
				{ params: {} },
				h(Settings, { params: {} }, h(Profile, { params: {} })),
			),
		);
	});

	test("renders index route when no further segments", () => {
		const Shell = (/** @type {any} */ props) => h("div", null, props.children);
		const Home = () => h("p", null, "home");
		const About = () => h("p", null, "about");
		const root = layout({ component: Shell }, [
			route({ component: Home }),
			route("about", { component: About }),
		]);

		const tree = new Router({ route: root, url: "/" }).render();
		assertVNode(tree, h(Shell, { params: {} }, h(Home, { params: {} })));
	});

	test("returns null when nothing matches", () => {
		const root = route("about", { component: c });
		const tree = new Router({ route: root, url: "/nope" }).render();
		assert.equal(tree, null);
	});

	test("passes params to matched components", () => {
		const Post = (/** @type {any} */ props) => h("p", null, props.params.id);
		const root = route(":id", { component: Post });

		const tree = new Router({ route: root, url: "/42" }).render();
		assertVNode(tree, h(Post, { params: { id: "42" } }));
	});

	test("renders loading state for lazy children", () => {
		const Shell = (/** @type {any} */ props) => h("div", null, props.children);
		const Section = (/** @type {any} */ props) =>
			props.loading
				? h("p", null, "loading...")
				: h("div", null, props.children);
		const lazyChildren = () => Promise.resolve({ default: [] });
		const root = layout({ component: Shell }, [
			route("section", { component: Section }, lazyChildren),
		]);

		const tree = new Router({ route: root, url: "/section/page" }).render();
		assertVNode(
			tree,
			h(Shell, { params: {} }, h(Section, { params: {}, loading: true })),
		);
	});

	test("renders resolved lazy children after load", async () => {
		const Shell = (/** @type {any} */ props) => h("div", null, props.children);
		const Section = (/** @type {any} */ props) =>
			h("section", null, props.children);
		const Page = () => h("p", null, "page");

		const sectionRoute = route("section", { component: Section }, () =>
			Promise.resolve({ default: [route("page", { component: Page })] }),
		);
		const root = layout({ component: Shell }, [sectionRoute]);

		const router = new Router({ route: root, url: "/section/page" });
		let rendered = false;
		router.setState = () => {
			rendered = true;
		};

		router.render();
		// Wait for the promise to resolve
		await new Promise((r) => setTimeout(r, 0));
		assert.ok(rendered);

		// After resolve, children is now an array — re-render
		const tree = router.render();
		assertVNode(
			tree,
			h(
				Shell,
				{ params: {} },
				h(Section, { params: {} }, h(Page, { params: {} })),
			),
		);
	});

	test("renders error state for failed lazy children", async () => {
		const Section = (/** @type {any} */ props) =>
			props.error ? h("p", null, "error") : h("div", null, props.children);
		const err = new Error("load failed");

		const sectionRoute = route("section", { component: Section }, () =>
			Promise.reject(err),
		);
		const root = layout({ component: c }, [sectionRoute]);

		const router = new Router({ route: root, url: "/section/page" });
		let stateUpdate = {};
		router.setState = (/** @type {any} */ s) => {
			stateUpdate = s;
		};

		router.render();
		await new Promise((r) => setTimeout(r, 0));
		assert.deepEqual(stateUpdate, { error: err });

		router.state = stateUpdate;
		const tree = router.render();
		assertVNode(
			tree,
			h(
				c,
				{ params: {} },
				h(Section, { params: {}, loading: true, error: err }),
			),
		);
	});
});
