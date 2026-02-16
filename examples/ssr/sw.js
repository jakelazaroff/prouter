import * as htmPreact from "https://esm.sh/htm@3/preact?deps=preact@10";
import * as preact from "https://esm.sh/preact@10";
import * as preactHooks from "https://esm.sh/preact@10/hooks?deps=preact@10";
import { renderToStringAsync } from "https://esm.sh/preact-render-to-string@6?deps=preact@10";

const { h } = preact;

const CDN = "https://esm.sh";
const PREACT = `${CDN}/preact@10`;
const PREACT_HOOKS = `${CDN}/preact@10/hooks`;
const HTM_PREACT = `${CDN}/htm@3/preact?deps=preact@10`;
const RENDER_TO_STRING = `${CDN}/preact-render-to-string@6?deps=preact@10`;

const BARE_IMPORTS = {
  '"htm/preact"': `"${HTM_PREACT}"`,
  '"preact/hooks"': `"${PREACT_HOOKS}"`,
  '"preact"': `"${PREACT}"`,
  '"prouter"': `"/prouter.js"`
};

function rewriteImports(source) {
  for (const [bare, full] of Object.entries(BARE_IMPORTS)) {
    source = source.replaceAll(bare, full);
  }
  return source;
}

/**
 * Fetches a local ES module, transforms import/export syntax into a callable
 * function body, and evaluates it with the given dependency map.
 */
async function loadModule(url, deps) {
  const res = await fetch(url);
  let src = await res.text();

  // Strip JSDoc type-only imports: /** @import { X } from "Y"; */
  src = src.replace(/\/\*\*\s*@import\b.*?\*\//gs, "");

  // import { a, b } from "mod" → const { a, b } = __deps["mod"]
  src = src.replace(
    /import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g,
    (_, names, mod) => `const {${names}} = __deps[${JSON.stringify(mod)}]`
  );

  // Collect exported names and strip the export keyword
  const names = [];
  src = src.replace(
    /^export\s+((?:async\s+)?(?:function|class|const|let|var))\s+(\w+)/gm,
    (_, kw, name) => {
      names.push(name);
      return `${kw} ${name}`;
    }
  );

  src = `"use strict";\n${src}\nreturn {${names.join(",")}}`;
  return new Function("__deps", src)(deps);
}

let root, Router, preload;

async function loadApp() {
  if (root) return;

  const prouter = await loadModule("/prouter.js", { preact });
  const app = await loadModule("/examples/ssr/app.js", {
    preact,
    "preact/hooks": preactHooks,
    "htm/preact": htmPreact,
    prouter
  });

  Router = prouter.Router;
  preload = prouter.preload;
  root = app.root;
}

function htmlShell(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>prouter — SSR Example</title>
  <script type="importmap">
  {
    "imports": {
      "preact": "${PREACT}",
      "preact/hooks": "${PREACT_HOOKS}",
      "htm/preact": "${HTM_PREACT}",
      "preact-render-to-string": "${RENDER_TO_STRING}",
      "prouter": "/prouter.js"
    }
  }
  </script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    nav { display: flex; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }
    nav a { text-decoration: none; color: #555; }
    nav a[data-active] { color: #000; font-weight: bold; border-bottom: 2px solid #000; }
    button { margin-bottom: 1rem; padding: 0.25rem 0.75rem; }
    .layer { margin: 0.5rem 0; }
    .layer-tag { display: inline-block; font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 3px; margin-bottom: 0.25rem; }
    .layer[data-state="ssr"] > .layer-tag { background: #eee; color: #666; }
    .layer[data-state="hydrated"] > .layer-tag { background: #d4ffd4; color: #181; }
    .layer[data-state="client"] > .layer-tag { background: #e0ecff; color: #246; }
    .spinner { color: #b80; font-style: italic; border-left: 3px solid #da0; padding: 0.5rem 0.75rem; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div id="app">${body}</div>
  <script type="module">
    import { h, hydrate } from "preact"
    import { init, Router } from "prouter"
    import { root } from "/examples/ssr/app.js"

    init({ base: "/examples/ssr" })
    hydrate(h(Router, { route: root }), document.getElementById("app"))
  </script>
</body>
</html>`;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Only handle same-origin requests under /examples/ssr/
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/examples/ssr")) return;

  // Navigation requests: SSR
  if (e.request.mode === "navigate") {
    e.respondWith(handleNavigation(url));
    return;
  }

  // JS files: rewrite bare imports (SW context has no import map)
  if (url.pathname.endsWith(".js")) {
    e.respondWith(handleJS(url));
    return;
  }
});

async function handleNavigation(url) {
  try {
    await loadApp();

    const path = url.pathname.replace(/^\/examples\/ssr\/?/, "/");
    await preload(root, path);
    const vnode = h(Router, { route: root, url: path });
    const body = await renderToStringAsync(vnode);
    return new Response(htmlShell(body), {
      headers: { "Content-Type": "text/html" }
    });
  } catch (err) {
    return new Response(`<pre>SSR Error: ${err?.stack || err}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
}

async function handleJS(url) {
  const res = await fetch(url);
  const source = rewriteImports(await res.text());
  return new Response(source, {
    headers: { "Content-Type": "application/javascript" }
  });
}
