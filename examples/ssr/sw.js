const CDN = "https://esm.sh"
const PREACT = `${CDN}/preact@10`
const PREACT_HOOKS = `${CDN}/preact@10/hooks`
const RENDER_TO_STRING = `${CDN}/preact-render-to-string@6`

const BARE_IMPORTS = {
  '"preact/hooks"': `"${PREACT_HOOKS}"`,
  '"preact"': `"${PREACT}"`,
  '"prouter"': `"/prouter.js"`
}

function rewriteImports(source) {
  for (const [bare, full] of Object.entries(BARE_IMPORTS)) {
    source = source.replaceAll(bare, full)
  }
  return source
}

async function importRewritten(url) {
  const res = await fetch(url)
  const source = rewriteImports(await res.text())
  const blob = new Blob([source], { type: "application/javascript" })
  return import(URL.createObjectURL(blob))
}

let h, renderToStringAsync, root, match

async function loadDeps() {
  if (h) return

  const [preact, rts, prouter, app] = await Promise.all([
    import(PREACT),
    import(RENDER_TO_STRING),
    importRewritten("/prouter.js"),
    importRewritten("/examples/ssr/app.js")
  ])

  h = preact.h
  renderToStringAsync = rts.renderToStringAsync
  root = app.root
  match = prouter.match
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
  </style>
</head>
<body>
  <div id="app">${body}</div>
  <script type="module">
    import { h, hydrate } from "preact"
    import { init, preload, Router } from "prouter"
    import { root } from "./app.js"

    init()
    await preload(root, location.pathname)
    hydrate(h(Router, { route: root }), document.getElementById("app"))
  </script>
</body>
</html>`
}

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)

  // Only handle same-origin requests under /examples/ssr/
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith("/examples/ssr")) return

  // Navigation requests: SSR
  if (e.request.mode === "navigate") {
    e.respondWith(handleNavigation(url))
    return
  }

  // JS files: rewrite bare imports (SW context has no import map)
  if (url.pathname.endsWith(".js")) {
    e.respondWith(handleJS(url))
    return
  }
})

async function handleNavigation(url) {
  try {
    await loadDeps()

    const { Router } = await importRewritten("/prouter.js")
    const path = url.pathname.replace(/^\/examples\/ssr\/?/, "/")
    const vnode = h(Router, { route: root, url: path })
    const body = await renderToStringAsync(vnode)
    return new Response(htmlShell(body), {
      headers: { "Content-Type": "text/html" }
    })
  } catch (err) {
    return new Response(`<pre>SSR Error: ${err.stack}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html" }
    })
  }
}

async function handleJS(url) {
  const res = await fetch(url)
  const source = rewriteImports(await res.text())
  return new Response(source, {
    headers: { "Content-Type": "application/javascript" }
  })
}
