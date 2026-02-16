import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { layout, NavLink, route } from "prouter";

const _initialPath = typeof location !== "undefined" ? location.pathname : null;

function Layer({ name, children }) {
  const [state, setState] = useState(
    location.pathname === _initialPath ? "ssr" : "client"
  );
  useEffect(() => {
    if (state === "ssr") setState("hydrated");
  }, []);
  return html`
    <div class="layer" data-state=${state}>
      <span class="layer-tag">${name} — ${state}</span>
      ${children}
    </div>
  `;
}

function Shell({ children }) {
  const [count, setCount] = useState(0);
  return html`
    <${Layer} name="Shell">
      <nav>
        <${NavLink} exact><a href="/examples/ssr/">Home</a><//>
        <${NavLink}><a href="/examples/ssr/settings/profile">Profile</a><//>
        <${NavLink}><a href="/examples/ssr/settings/billing">Billing</a><//>
      </nav>
      <p>
        This page was server-rendered by a service worker. Click the counter —
        it stays interactive while settings routes lazy-load.
      </p>
      <button onClick=${() => setCount(count + 1)}>Count: ${count}</button>
      ${children}
    <//>
  `;
}

function Home() {
  return html`<${Layer} name="Home"><h1>Home</h1><//>`;
}

function Settings({ children }) {
  return children;
}

function Spinner() {
  return html`<p class="spinner">Loading…</p>`;
}

function Profile() {
  return html`
    <${Layer} name="Profile">
      <h2>Profile</h2>
      <p>Edit your profile settings here.</p>
    <//>
  `;
}

function Billing() {
  return html`
    <${Layer} name="Billing">
      <h2>Billing</h2>
      <p>Manage your billing and payment methods.</p>
    <//>
  `;
}

function lazySettings() {
  return new Promise(resolve =>
    setTimeout(
      () =>
        resolve([
          route("profile", { component: Profile }),
          route("billing", { component: Billing })
        ]),
      1500
    )
  );
}

export const root = layout({ component: Shell }, [
  route({ component: Home }),
  route("settings", { component: Settings, fallback: Spinner }, lazySettings)
]);
