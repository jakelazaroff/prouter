import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { h } from "preact";

import {
  index,
  init,
  lazy,
  layout,
  match,
  navigate,
  preload,
  Router,
  RouterContext,
  route
} from "./prouter.js";

const c = () => null;

// Type-level tests: verify param inference at typecheck time
/** @template T @param {T | undefined} v @returns {T} */
function defined(v) {
  if (v === undefined) throw new Error("expected defined");
  return v;
}
{
  const paramRoute = route(":id", { component: c }, []);
  /** @type {string} */
  const id = defined(match([paramRoute], ["42"])[0]).params.id;
  void id;

  const multiParam = route(":category/:id", { component: c }, []);
  /** @type {string} */
  const cat = defined(match([multiParam], ["a", "b"])[0]).params.category;
  /** @type {string} */
  const mid = defined(match([multiParam], ["a", "b"])[0]).params.id;
  (void cat, void mid);

  const noParams = route("about", { component: c }, []);
  /** @type {{}} */
  const empty = defined(match([noParams], ["about"])[0]).params;
  void empty;

  // Verify Route type still infers params from path
  void (
    /** @type {import("./prouter.js").Route<":id", {id: string}>} */ (
      paramRoute
    )
  );
  void (
    /** @type {import("./prouter.js").Route<":category/:id", {category: string, id: string}>} */ (
      multiParam
    )
  );
  void (
    // @ts-expect-error — wrong param shape must be rejected
    /** @type {import("./prouter.js").Route<":id", {bogus: string}>} */ (
      paramRoute
    )
  );

  // Verify parent option accumulates params at type level
  const parentRoute = route("posts/:postId", { component: c }, []);
  const childRoute = route(":commentId", {
    component: c,
    parent: () => parentRoute
  }, []);
  /** @type {string} */
  const postId = defined(match([childRoute], ["42"])[0]).params.postId;
  /** @type {string} */
  const commentId = defined(match([childRoute], ["42"])[0]).params.commentId;
  (void postId, void commentId);
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

/** Unwrap RouterContext.Provider from Router.render() output */
function unwrap(/** @type {any} */ tree) {
  assert.equal(tree.type, RouterContext.Provider);
  return tree.props.children;
}

describe("lazy", () => {
  test("returns a lazy component descriptor", () => {
    const load = () => Promise.resolve(c);
    const lz = lazy(load);
    const sym = Object.getOwnPropertySymbols(lz).find(s => s.description === "lazy");
    assert.ok(sym, "should have a Symbol('lazy') key");
    assert.equal(lz[sym], true);
    assert.equal(lz.load, load);
  });
});

describe("match", () => {
  test("matches a root index route", () => {
    const idx = index({ component: c });
    const result = match([idx], []);
    assert.deepEqual(result, [{ route: idx, params: {} }]);
  });

  test("returns an empty array when nothing matches", () => {
    const idx = index({ component: c });
    const result = match([idx], ["foo"]);
    assert.deepEqual(result, []);
  });

  test("matches a single segment", () => {
    const about = route("about", { component: c }, []);
    const result = match([about], ["about"]);
    assert.deepEqual(result, [{ route: about, params: {} }]);
  });

  test("matches a layout with children", () => {
    const about = route("about", { component: c }, []);
    const root = layout({ component: c }, [about]);
    const result = match([root], ["about"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: about, params: {} }
    ]);
  });

  test("matches nested routes", () => {
    const billing = route("billing", { component: c }, []);
    const account = route("account", { component: c }, [billing]);
    const root = layout({ component: c }, [account]);

    const result = match([root], ["account", "billing"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: account, params: {} },
      { route: billing, params: {} }
    ]);
  });

  test("matches :param segments", () => {
    const detail = route(":id", { component: c }, []);
    const posts = route("posts", { component: c }, [detail]);
    const root = layout({ component: c }, [posts]);

    const result = match([root], ["posts", "42"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: posts, params: {} },
      { route: detail, params: { id: "42" } }
    ]);
  });

  test("picks first matching child", () => {
    const alpha = route("alpha", { component: c }, []);
    const beta = route("beta", { component: c }, []);
    const root = layout({ component: c }, [alpha, beta]);

    const result = match([root], ["beta"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: beta, params: {} }
    ]);
  });

  test("matches through routes with lazy components", () => {
    const lazyComp = lazy(() => Promise.resolve(c));
    const child = route("page", { component: c }, []);
    const parent = route("section", { component: lazyComp }, [child]);
    const root = layout({ component: c }, [parent]);

    const result = match([root], ["section", "page"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: parent, params: {} },
      { route: child, params: {} }
    ]);
  });

  test("matches nested index route", () => {
    const idx = index({ component: c });
    const settings = route("settings", { component: c }, [idx]);
    const root = layout({ component: c }, [settings]);

    const result = match([root], ["settings"]);
    assert.deepEqual(result, [
      { route: root, params: {} },
      { route: settings, params: {} },
      { route: idx, params: {} }
    ]);
  });
});

describe("Router", () => {
  test("renders a leaf route component", () => {
    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const tree = new Router({ route: root, url: "/" }).render();
    assertVNode(unwrap(tree), h(Home, { params: {}, query: {} }));
  });

  test("renders a layout wrapping a child", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const About = () => h("p", null, "about");
    const root = layout({ component: Shell }, [
      route("about", { component: About }, [])
    ]);

    const tree = new Router({ route: root, url: "/about" }).render();
    assertVNode(
      unwrap(tree),
      h(Shell, { params: {}, query: {} }, h(About, { params: {}, query: {} }))
    );
  });

  test("renders nested layouts", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Settings = (/** @type {any} */ props) =>
      h("section", null, props.children);
    const Profile = () => h("p", null, "profile");
    const root = layout({ component: Shell }, [
      route("settings", { component: Settings }, [
        route("profile", { component: Profile }, [])
      ])
    ]);

    const tree = new Router({ route: root, url: "/settings/profile" }).render();
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: {}, query: {} },
        h(
          Settings,
          { params: {}, query: {} },
          h(Profile, { params: {}, query: {} })
        )
      )
    );
  });

  test("renders index route when no further segments", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Home = () => h("p", null, "home");
    const About = () => h("p", null, "about");
    const root = layout({ component: Shell }, [
      index({ component: Home }),
      route("about", { component: About }, [])
    ]);

    const tree = new Router({ route: root, url: "/" }).render();
    assertVNode(
      unwrap(tree),
      h(Shell, { params: {}, query: {} }, h(Home, { params: {}, query: {} }))
    );
  });

  test("returns null when nothing matches", () => {
    const root = route("about", { component: c }, []);
    const tree = new Router({ route: root, url: "/nope" }).render();
    assert.equal(tree, null);
  });

  test("passes params to matched components", () => {
    const Post = (/** @type {any} */ props) => h("p", null, props.params.id);
    const root = route(":id", { component: Post }, []);

    const tree = new Router({ route: root, url: "/42" }).render();
    assertVNode(unwrap(tree), h(Post, { params: { id: "42" }, query: {} }));
  });

  test("passes accumulated params to all nested components", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Post = (/** @type {any} */ props) =>
      h("section", null, props.children);
    const Comment = (/** @type {any} */ props) =>
      h("p", null, props.params.commentId);
    const root = layout({ component: Shell }, [
      route("posts/:postId", { component: Post }, [
        route(":commentId", { component: Comment }, [])
      ])
    ]);

    const tree = new Router({ route: root, url: "/posts/5/99" }).render();
    const accumulated = { postId: "5", commentId: "99" };
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: accumulated, query: {} },
        h(
          Post,
          { params: accumulated, query: {} },
          h(Comment, { params: accumulated, query: {} })
        )
      )
    );
  });

  test("passes query string params as props", () => {
    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const tree = new Router({ route: root, url: "/?foo=bar&baz=1" }).render();
    assertVNode(
      unwrap(tree),
      h(Home, { params: {}, query: { foo: "bar", baz: "1" } })
    );
  });

  test("decodes query string keys and values", () => {
    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const tree = new Router({
      route: root,
      url: "/?hello%20world=foo%26bar"
    }).render();
    assertVNode(
      unwrap(tree),
      h(Home, { params: {}, query: { "hello world": "foo&bar" } })
    );
  });

  test("passes empty query when no query string", () => {
    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const tree = new Router({ route: root, url: "/" }).render();
    assertVNode(unwrap(tree), h(Home, { params: {}, query: {} }));
  });

  test("renders Boundary for lazy component", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Spinner = () => h("p", null, "loading...");
    const lazyComp = lazy(() => Promise.resolve(c));
    const sectionRoute = route(
      "section",
      { component: lazyComp, fallback: Spinner },
      []
    );
    const root = layout({ component: Shell }, [sectionRoute]);

    const tree = new Router({ route: root, url: "/section" }).render();
    const inner = unwrap(tree);
    // Shell > Boundary (because component is lazy)
    assert.equal(inner.type, Shell);
    const boundary = inner.props.children;
    assert.equal(boundary.props.fallback.type, Spinner);
  });

  test("renders resolved lazy component after load", async () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Page = () => h("p", null, "page");
    const lazyPage = lazy(() => Promise.resolve(Page));
    const pageRoute = route("page", { component: lazyPage }, []);
    const root = layout({ component: Shell }, [pageRoute]);

    const router = new Router({ route: root, url: "/page" });

    // First render kicks off the load
    router.render();

    await new Promise(r => setTimeout(r, 0));

    // After resolve, component is replaced — re-render shows the component
    const tree = router.render();
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: {}, query: {} },
        h(Page, { params: {}, query: {} })
      )
    );
  });

  test("kicks off multiple lazy loads in parallel", async () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Settings = (/** @type {any} */ props) =>
      h("section", null, props.children);
    const Profile = () => h("p", null, "profile");

    const lazySettings = lazy(() => Promise.resolve(Settings));
    const lazyProfile = lazy(() => Promise.resolve(Profile));

    const root = layout({ component: Shell }, [
      route("settings", { component: lazySettings }, [
        route("profile", { component: lazyProfile }, [])
      ])
    ]);

    const router = new Router({ route: root, url: "/settings/profile" });
    router.render();

    await new Promise(r => setTimeout(r, 0));

    const tree = router.render();
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: {}, query: {} },
        h(
          Settings,
          { params: {}, query: {} },
          h(Profile, { params: {}, query: {} })
        )
      )
    );
  });
});

describe("preload", () => {
  /** @param {Router} router */
  function ctx(router) {
    return /** @type {any} */ (router.render()).props.value;
  }

  test("resolves lazy components by path", async () => {
    const Page = () => h("p", null, "page");
    const lazyPage = lazy(() => Promise.resolve(Page));
    const pageRoute = route("page", { component: lazyPage }, []);
    const root = layout({ component: c }, [pageRoute]);

    await preload(root, "/page");
    assert.equal(pageRoute.component, Page);
  });

  test("resolves multiple lazy components in parallel", async () => {
    const Section = () => h("section", null);
    const Page = () => h("p", null, "page");
    const lazySection = lazy(() => Promise.resolve(Section));
    const lazyPage = lazy(() => Promise.resolve(Page));

    const sectionRoute = route("section", { component: lazySection }, [
      route("page", { component: lazyPage }, [])
    ]);
    const root = layout({ component: c }, [sectionRoute]);

    await preload(root, "/section/page");
    assert.equal(sectionRoute.component, Section);
    assert.equal(/** @type {any} */ (sectionRoute.children[0]).component, Page);
  });

  test("no-ops on non-lazy path", async () => {
    const children = [route("page", { component: c }, [])];
    const sectionRoute = route("section", { component: c }, children);
    const root = layout({ component: c }, [sectionRoute]);

    await preload(root, "/section/page");
    assert.equal(sectionRoute.component, c);
  });

  test("renders context provider", () => {
    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const router = new Router({ route: root, url: "/" });
    const tree = /** @type {any} */ (router.render());
    assert.equal(tree.type, RouterContext.Provider);
    assert.equal(tree.props.value.navigate, navigate);
    assert.equal(typeof tree.props.value.preload, "function");
  });
});

function memory(url = "/") {
  const source = {
    url,
    read: () => source.url,
    write: (/** @type {string} */ u) => {
      source.url = u;
    }
  };
  return source;
}

describe("navigate", () => {
  test("updates currentUrl and triggers re-render", () => {
    const mem = memory();
    init({ source: mem });

    const Home = () => h("p", null, "home");
    const About = () => h("p", null, "about");
    const root = layout({ component: c }, [
      index({ component: Home }),
      route("about", { component: About }, [])
    ]);

    const router = new Router({ route: root });
    let rendered = false;
    router.forceUpdate = () => {
      rendered = true;
    };
    router.componentDidMount();

    const tree1 = router.render();
    assertVNode(
      unwrap(tree1),
      h(c, { params: {}, query: {} }, h(Home, { params: {}, query: {} }))
    );

    navigate("/about");
    assert.ok(rendered);
    assert.equal(mem.url, "/about");

    const tree2 = router.render();
    assertVNode(
      unwrap(tree2),
      h(c, { params: {}, query: {} }, h(About, { params: {}, query: {} }))
    );

    router.componentWillUnmount();
  });

  test("Router with explicit url prop ignores navigate", () => {
    const mem = memory();
    init({ source: mem });

    const Home = () => h("p", null, "home");
    const root = index({ component: Home });

    const router = new Router({ route: root, url: "/" });
    let rendered = false;
    router.forceUpdate = () => {
      rendered = true;
    };
    router.componentDidMount();

    navigate("/other");
    assert.ok(!rendered);

    router.componentWillUnmount();
  });

  test("multiple subscribers all get notified", () => {
    const mem = memory();
    init({ source: mem });

    const root = index({ component: c });
    const router1 = new Router({ route: root });
    const router2 = new Router({ route: root });
    let count = 0;
    router1.forceUpdate = () => count++;
    router2.forceUpdate = () => count++;
    router1.componentDidMount();
    router2.componentDidMount();

    navigate("/foo");
    assert.equal(count, 2);

    router1.componentWillUnmount();
    router2.componentWillUnmount();
  });

  test("unsubscribed router does not get notified", () => {
    const mem = memory();
    init({ source: mem });

    const root = index({ component: c });
    const router = new Router({ route: root });
    let count = 0;
    router.forceUpdate = () => count++;
    router.componentDidMount();

    navigate("/a");
    assert.equal(count, 1);

    router.componentWillUnmount();
    navigate("/b");
    assert.equal(count, 1);
  });
});

describe("Suspense", () => {
  test("no Boundary rendered when component is pre-resolved", () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Section = (/** @type {any} */ props) =>
      h("section", null, props.children);
    const Page = () => h("p", null, "page");

    const root = layout({ component: Shell }, [
      route("section", { component: Section }, [
        route("page", { component: Page }, [])
      ])
    ]);

    const tree = new Router({ route: root, url: "/section/page" }).render();
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: {}, query: {} },
        h(
          Section,
          { params: {}, query: {} },
          h(Page, { params: {}, query: {} })
        )
      )
    );
  });

  test("Boundary without fallback renders null while loading", () => {
    const lazyComp = lazy(() => Promise.resolve(c));
    const sectionRoute = route("section", { component: lazyComp }, []);
    const root = layout({ component: c }, [sectionRoute]);

    const tree = new Router({ route: root, url: "/section" }).render();
    const boundary = unwrap(tree).props.children;
    assert.equal(boundary.props.fallback, null);
  });

  test("renders resolved component after load", async () => {
    const Shell = (/** @type {any} */ props) => h("div", null, props.children);
    const Page = () => h("p", null, "page");
    const lazyPage = lazy(() => Promise.resolve(Page));

    const pageRoute = route("page", { component: lazyPage }, []);
    const root = layout({ component: Shell }, [pageRoute]);

    const router = new Router({ route: root, url: "/page" });
    router.render();

    await new Promise(r => setTimeout(r, 0));

    const tree = router.render();
    assertVNode(
      unwrap(tree),
      h(
        Shell,
        { params: {}, query: {} },
        h(Page, { params: {}, query: {} })
      )
    );
  });

  test("fallback prop is passed through route()", () => {
    const Spinner = () => h("p", null, "loading...");
    const r = route("foo", { component: c, fallback: Spinner }, []);
    assert.equal(r.fallback, Spinner);
  });

  test("fallback prop is passed through layout()", () => {
    const Spinner = () => h("p", null, "loading...");
    const l = layout({ component: c, fallback: Spinner }, []);
    assert.equal(l.fallback, Spinner);
  });

  test("SSR streaming: Boundary has __c marker for preact-render-to-string", () => {
    const lazyComp = lazy(() => Promise.resolve(c));
    const Spinner = () => h("p", null, "loading...");
    const sectionRoute = route(
      "section",
      { component: lazyComp, fallback: Spinner },
      []
    );
    const root = layout({ component: c }, [sectionRoute]);

    const tree = new Router({ route: root, url: "/section" }).render();
    const boundary = unwrap(tree).props.children;

    // Verify Boundary has __c (the marker preact-render-to-string checks)
    const boundaryInstance = new boundary.type({});
    assert.equal(typeof boundaryInstance.__c, "function");
  });
});
