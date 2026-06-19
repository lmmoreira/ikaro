# Ikaro — Frontend Learning Journal

> **Who this is for:** A backend specialist (NestJS, TypeORM, PostgreSQL) building a production Next.js frontend for the first time.
> **Format:** Concepts explained via backend analogies, followed by the real decision made in this codebase and why.
> **Updated:** Each milestone adds a new section. Start at the top and read forward.

---

## Table of Contents

- [M12-S03 — Foundation: Next.js, React, CSS Variables, Fonts](#m12-s03)
- [M12-S03 (cont.) — Testing: Vitest, Mocking, Coverage, SonarCloud](#m12-s03-testing)
- [M12-S04–S06 — Module Components: Anatomy, Props, Component Testing](#m12-s04)
- [M12-S04–S06 (cont.) — The Islands Pattern, LCP, Client/Server Split](#m12-islands)
- [M12-S04–S06 (cont.) — Next.js Caching Deep Dive](#m12-caching)
- [M12-S04–S06 (cont.) — Data Validation Gate, Social Links Architecture](#m12-validation)
- [M12-S07 — Booking Form: Multi-Step State, Controlled Inputs, Adapters, Uploads, Errors](#m12-s07)
- [M12-S08 — 404 vs "Coming Soon": Two Kinds of "Not Ready"](#m12-s08)
- [M12-S09 — SEO: Metadata, Open Graph, JSON-LD, Sitemap, Robots](#m12-s09)
- [M12-S10 — Storage: Public vs Private Buckets, Cross-Service Revalidation](#m12-s10)
- [M12-S11 — Extending a Design-Token System Without Breaking Old Tenants](#m12-s11)
- [M12-S12 — Linting React: react-hooks and jsx-a11y](#m12-s12)
- [M13-S41 — Playwright E2E: What Integration Tests Can't Catch](#m13-s41)
- [M13-S01 — TanStack Query + Typed BFF Client](#m13-s01)
- [M13-S02 — HTTP Cookies, Auth Security, and BFF Patterns](#m13-s02)

---

<a name="m12-s03"></a>
## M12-S03 — Foundation: Routing, Rendering, Branding

---

### 1. What is React?

React is a library for building UIs out of **components** — functions that return HTML-like markup (called JSX).

```tsx
// A React component is just a function that returns markup
function Greeting({ name }: { name: string }) {
  return <p>Olá, {name}!</p>;
}
```

**Backend analogy:** A component is like a function that returns a serialized response — except instead of JSON, it returns HTML structure. Props are like function arguments.

The key idea: **you describe what the UI should look like given some data, and React figures out how to render it**. You don't manipulate the DOM directly (no `document.getElementById`). You just return markup and React handles the rest.

---

### 2. What is Next.js?

Next.js is a framework built on top of React that adds:
- **Routing** — file-system based (a file at `app/[slug]/page.tsx` becomes the route `/:slug`)
- **Server-side rendering** — components can run on the server, not just in the browser
- **Caching and ISR** — built-in HTTP cache with revalidation strategies
- **Image optimisation, font loading, bundle splitting** — production concerns handled for you

**Backend analogy:** React is like Express's `res.send()`. Next.js is like NestJS — it adds routing, middleware, lifecycle hooks, and production tooling on top.

---

### 3. The App Router — Files ARE Routes

In Next.js App Router, the folder structure under `apps/web/app/` defines your routes:

```
app/
├── layout.tsx          → wraps every page (root layout)
├── page.tsx            → GET /
├── [slug]/
│   ├── layout.tsx      → wraps all /<slug>/* pages
│   └── page.tsx        → GET /:slug
├── dashboard/
│   └── page.tsx        → GET /dashboard
└── api/
    └── revalidate/
        └── route.ts    → GET /api/revalidate  (API endpoint, not a page)
```

**Backend analogy:** This is like NestJS controllers, but the file path IS the route. No `@Controller()` decorators needed.

**`layout.tsx` vs `page.tsx`:**
- `layout.tsx` — runs on every request to that route and its children. Used for shared structure (nav, branding injection). Like NestJS middleware or interceptors.
- `page.tsx` — the actual content for that specific route.

Layouts **wrap** pages. So for `GET /lavacar-beloauto`:
1. `app/layout.tsx` runs first (root layout — sets `<html>`, `<body>`)
2. `app/[slug]/layout.tsx` runs next (fetches manifest, injects branding)
3. `app/[slug]/page.tsx` runs last (renders the modules)

**Why we have two layouts:** The root layout is minimal — it owns `<html>` and `<body>`. The slug layout injects the tenant's branding. Only one element can own `<html>`/`<body>` in Next.js — that's why the slug layout uses a `<div id="hotsite-root">` wrapper instead of replacing `<html>`.

---

### 4. Server Components vs Client Components

This is the most important concept in modern Next.js.

**Server Component** (default): Runs on the server. Can `await` database calls, fetch APIs, read env vars. Returns HTML. **No interactivity** — no `onClick`, no `useState`.

**Client Component** (opt-in, add `'use client'` at top of file): Runs in the browser. Can have state, event handlers, browser APIs. **Cannot** directly `await` data fetches at render time.

```tsx
// Server Component (no directive needed — default)
export default async function HotsitePage({ params }) {
  const manifest = await fetchManifest(params.slug); // runs on server
  return <main>{/* render manifest */}</main>;
}

// Client Component
'use client';
export function BookingForm() {
  const [step, setStep] = useState(1); // useState only works in client components
  return <button onClick={() => setStep(2)}>Próximo</button>;
}
```

**Backend analogy:** Server components are like your NestJS controllers — they run on the server, fetch data, and produce output. Client components are like frontend JavaScript that runs after the page loads (like jQuery, but modern).

**Rule of thumb:** Start everything as a server component (the default). Only add `'use client'` when you need interactivity (buttons, forms, state). This gives you the best performance — less JavaScript sent to the browser.

**In Ikaro:**
- `[slug]/layout.tsx` — server component (fetches manifest)
- `[slug]/page.tsx` — server component (renders module list)
- Future `BookingForm` — client component (multi-step form with state)
- Future `ServiceCard` with a "select" toggle — client component

---

### 5. ISR — Incremental Static Regeneration (The Cache)

When `fetchManifest()` calls the BFF with `next: { revalidate: 300 }`, Next.js caches the result for 300 seconds (5 minutes).

```
First request  → fetch from BFF, cache result, return to user
Requests 2–N   → return from cache (no BFF call, instant)
After 5 min    → return stale cache, trigger background refresh
Admin publishes → POST /api/revalidate → cache cleared immediately
```

**Backend analogy:** This is exactly like a Redis cache with TTL, but built into Next.js's `fetch`. The `revalidate: 300` is the TTL. The `/api/revalidate` endpoint is the cache invalidation hook.

**Why this matters for Ikaro:** The hotsite manifest doesn't change unless the admin edits it. Caching it for 5 minutes means 99% of visitor requests never hit the BFF at all. When the admin publishes a change, the backend calls our `/api/revalidate` endpoint (M12-S10 already wires this), which clears the cache immediately.

**Why we can cache it safely (and why M12-S10 was important):** The manifest contains image URLs. If those were expiring signed URLs (like S3 pre-signed URLs), they'd expire inside the cache window and serve broken images to visitors. M12-S10 changed hotsite images to permanent public bucket URLs — no expiry, safe to cache forever. Booking photos are still signed URLs (they're private), just never cached in the manifest.

---

### 6. CSS — The Basics for a Backend Developer

CSS (Cascading Style Sheets) tells the browser how to visually render HTML. Three concepts matter most here:

**6a. The Cascade:** Styles apply from parent to child. If you set `color: red` on a `<div>`, all text inside that div and its children is red — unless a child overrides it. "Cascading" = inheritance down the tree.

**6b. CSS Custom Properties (Variables):** Variables you define and reuse across your styles.

```css
/* Define on an element — available to that element and all its children */
#hotsite-root {
  --ba-primary: #f97316;
  --ba-radius: 8px;
}

/* Use anywhere inside #hotsite-root */
button {
  background-color: var(--ba-primary);  /* resolves to #f97316 */
  border-radius: var(--ba-radius);       /* resolves to 8px */
}
```

**Backend analogy:** CSS variables are like environment variables — define them once, reference them everywhere. Change the value in one place and everything that uses it updates.

**Why we use them for branding:** Every tenant has different colors. Instead of generating per-tenant CSS files, we inject each tenant's values as CSS variables on `#hotsite-root` at render time. Every module component just uses `var(--ba-primary)` — it automatically gets the right tenant's color with no extra work per module.

**6c. The Box Model:** Every HTML element is a rectangle. CSS controls its `width`, `height`, `padding` (space inside), `margin` (space outside), and `border`. Most layout problems come down to understanding these.

---

### 7. Tailwind CSS — Utility Classes

Tailwind replaces writing CSS files with applying pre-defined classes directly in your HTML/JSX.

```tsx
// Without Tailwind — you'd write a CSS class somewhere
<div className="card">...</div>
// .card { display: flex; padding: 1rem; background: white; border-radius: 8px; }

// With Tailwind — classes ARE the styles
<div className="flex p-4 bg-white rounded-lg">...</div>
```

**Backend analogy:** Tailwind is like a standard library of pre-named values. Instead of defining your own variable names, you use the library's names (`p-4` = `padding: 1rem`, `flex` = `display: flex`).

**Responsive breakpoints:** Tailwind uses prefixes for screen sizes:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {/* 1 column on mobile, 2 on tablet, 3 on desktop */}
</div>
```

**Ikaro rule:** Use Tailwind for layout and spacing. Use `var(--ba-*)` for anything brandable (colors, fonts, radius, shadows). Never hardcode colors like `bg-orange-500` — that would ignore the tenant's branding.

```tsx
// ✓ correct
<button
  className="px-6 py-3 font-semibold"
  style={{ backgroundColor: 'var(--ba-primary)', borderRadius: 'var(--ba-radius)' }}
>
  Agendar
</button>

// ✗ wrong — hardcoded color ignores tenant branding
<button className="px-6 py-3 bg-orange-500 rounded-lg">
  Agendar
</button>
```

**Tailwind v4 note:** This project uses Tailwind v4, which drops the `tailwind.config.js` file. Configuration is now done in CSS via `@import "tailwindcss"`. You just use classes — no config file to touch.

---

### 8. `next/font/google` — Why We Load Fonts at Build Time

Fonts loaded from Google Fonts normally work like this:
1. Browser loads your page
2. Browser makes a request to `fonts.googleapis.com` (Google's servers in the USA)
3. Google serves the font file
4. Browser renders text with the font

**Problems with this approach:**
- **Performance:** Extra network round-trip to Google before text renders (causes "flash of unstyled text")
- **LGPD (Brazil's GDPR):** Google's CDN logs visitor IPs. Serving fonts from Google means sharing your users' data with a third party — a compliance concern

`next/font/google` solves both by downloading the font files at build time and hosting them yourself:
1. During `pnpm build`, Next.js downloads the font from Google
2. Font is bundled with your app and served from your own domain
3. No runtime Google CDN request — no LGPD exposure, no extra round-trip

```tsx
// font-config.ts — runs at BUILD TIME, not in the browser
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',  // creates a CSS variable
});
```

The `variable` option makes Next.js output a CSS class that defines the font as a CSS variable. We apply those classes to `#hotsite-root`, making the fonts available as `var(--font-playfair-display)` to all children.

**FONT_MAP** then bridges manifest keys to CSS variables:
```
manifest: { headingFontFamily: "Playfair Display" }
    ↓
FONT_MAP["Playfair Display"] = "var(--font-playfair-display)"
    ↓
--ba-heading-font: var(--font-playfair-display)
    ↓
h1 { font-family: var(--ba-heading-font); }  → renders in Playfair Display
```

---

### 9. `next/image` — Why Not Just `<img>`?

The built-in `<img>` tag sends the original image at its original size. A 4MB logo gets sent to every visitor regardless of their screen size.

`next/image` (`import Image from 'next/image'`) automatically:
- **Resizes** the image to the exact size needed for the visitor's screen
- **Converts** to modern formats (WebP, AVIF) for smaller file sizes
- **Lazy loads** images below the fold (doesn't download until scrolling near them)
- **Reserves space** to prevent layout shift as images load

```tsx
import Image from 'next/image';

// ✓ use this — optimised, lazy by default
<Image src={backgroundUrl} alt="Hero background" fill />

// For LCP (Largest Contentful Paint — the hero image is typically the biggest element)
// add priority to disable lazy loading for it
<Image src={heroBackground} alt="" fill priority />
```

**`next.config.mjs` `remotePatterns`:** `next/image` optimises remote images by proxying them through Next.js. For security, it only proxies images from explicitly whitelisted hostnames. That's why we added `images.remotePatterns` reading from `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` — without it, any `next/image` pointing to our GCS bucket would throw an error.

---

### 10. The `[slug]` Dynamic Segment

`app/[slug]/page.tsx` — the square brackets mean this is a dynamic route. The folder name becomes a parameter.

```
GET /lavacar-beloauto  →  params.slug = "lavacar-beloauto"
GET /autowash-pro      →  params.slug = "autowash-pro"
GET /any-string        →  params.slug = "any-string"
```

**Next.js 16 change — async params:** In Next.js 16, `params` is now a `Promise`. You must `await` it before accessing properties. This is a breaking change from Next.js 14:

```tsx
// Next.js 14 (old)
export default function Page({ params }: { params: { slug: string } }) {
  const { slug } = params; // sync — worked fine in v14
}

// Next.js 16 (current)
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; // must await — v16 requirement
}
```

**Why the change?** Next.js 16 can now stream params to the component earlier in the request lifecycle, which requires them to be asynchronous. It's a performance improvement that required a breaking API change.

---

### 11. `fetch()` Deduplication — Why Calling fetchManifest Twice is Fine

Both `[slug]/layout.tsx` and `[slug]/page.tsx` call `fetchManifest(slug)`. You might expect this to make two BFF calls per page load — it doesn't.

Next.js automatically deduplicates `fetch()` calls with the same URL and options within a single render. The second call is served from a per-request memory cache — zero extra network calls.

**Backend analogy:** This is like a DataLoader / request-scoped cache pattern. Within one HTTP request to the server, identical sub-requests are batched or cached.

**Why both layouts need to call it:** `layout.tsx` needs the branding to inject CSS variables. `page.tsx` needs the layout array to render modules. They're both server components — there's no way to pass data between them except by calling the same function. The deduplication makes this free.

---

### 12. How This All Fits Together (Request Flow)

When a visitor opens `http://localhost:3000/lavacar-beloauto`:

```
Browser → Next.js server
  → app/layout.tsx          renders <html lang="pt-BR"><body ...>
  → app/[slug]/layout.tsx   fetches manifest from BFF (or cache)
                             injects --ba-* CSS variables on #hotsite-root
                             loads 8 fonts via next/font/google CSS variables
  → app/[slug]/page.tsx     fetches manifest (deduplicated — no BFF call)
                             filters layout[] to enabled: true
                             for each module, looks up MODULE_MAP[type]
                             currently: MODULE_MAP is empty → renders nothing
                             renders <Footer />
  → HTML sent to browser     browser applies CSS variables, renders text
```

After M12-S04 lands, `MODULE_MAP.HERO = HeroModule`. The HERO module renders with the tenant's branding automatically via `var(--ba-*)`.

---

---

<a name="m12-s03-testing"></a>
## M12-S03 (cont.) — Testing: Vitest, Mocking, Coverage, SonarCloud

---

### 13. Why Vitest Instead of Jest

The backend and BFF use Jest — so why does the web app use Vitest?

**Root cause: ESM vs CommonJS.**

JavaScript historically used CommonJS (`require()`, `module.exports`). Modern tooling — including Next.js 16 and `next/server`, `next/font/google`, etc. — uses ESM (`import`/`export`). Jest was designed for CommonJS. Making Jest handle ESM packages requires a Babel or `ts-jest` transform layer that recompiles imports at test time. This transform is fragile: some Next.js internals resist it and crash.

Vitest is ESM-native. It runs TypeScript/ESM directly without a recompile step, so Next.js packages import cleanly.

**Backend analogy:** It's like choosing between a tool that natively speaks your protocol vs one that needs an adapter. The adapter usually works, but breaks on edge cases.

**API is nearly identical to Jest:**

| Jest | Vitest |
|---|---|
| `jest.fn()` | `vi.fn()` |
| `jest.mock('module', ...)` | `vi.mock('module', ...)` |
| `jest.spyOn(obj, 'method')` | `vi.spyOn(obj, 'method')` |
| `jest.mocked(fn)` | `vi.mocked(fn)` |
| `describe`, `it`, `expect` | same |

If you know Jest, you know Vitest. The main difference is the `vi.*` namespace instead of `jest.*`.

---

### 14. What We Test (and What We Don't)

#### What we test — three categories

**1. Pure utility functions** (`apply-branding.ts`, `font-config.ts`)

These are functions with no side effects: input goes in, CSS tokens or a record comes out. No browser, no network, no framework. Identical to testing a NestJS service method that transforms data.

```ts
// apply-branding.spec.ts
it('maps border-radius variants correctly', () => {
  const result = applyBranding(makeBranding({ borderRadius: 'sharp' })) as CSSTokens;
  expect(result['--ba-radius']).toBe('0px');
});
```

**2. API route handlers** (`app/api/revalidate/route.ts`)

A Next.js route handler is just a function: it receives a `Request` and returns a `Response`. Mock the Next.js-specific side effects (`revalidatePath`), then test the auth and branching logic directly.

```ts
// route.spec.ts
it('returns 401 when the revalidate secret header is missing', async () => {
  const response = await GET(makeRequest('tenant-a')); // no secret header
  expect(response.status).toBe(401);
});
```

**3. Async data fetchers** (`lib/api/platform.ts`)

Functions that call `fetch()` and handle errors. Mock global `fetch`, test what happens on 200, 404, and 500 responses.

```ts
// tenant.spec.ts
it('calls notFound() when the BFF returns 404', async () => {
  fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
  await expect(fetchManifest('unknown-slug')).rejects.toThrow('NEXT_NOT_FOUND');
});
```

#### What we don't test (and why)

**React Server Components (layouts, pages):** `[slug]/layout.tsx` and `[slug]/page.tsx` are server components that call `await params`, `await fetchManifest()`, and return JSX. Testing them in Vitest would require mocking the entire Next.js server runtime. The result would be tests that verify the mocks work, not that the code works. These are validated by **Playwright E2E tests** (planned for M16) which run a real Next.js server.

**Client components with DOM interaction:** Buttons, forms, modals — these need a browser environment. Playwright covers them at the integration level.

**Rule of thumb:** Unit-test what's pure and logic-heavy. E2E-test what's visual and interactive.

---

### 15. The Mocking Problem with `next/font/google`

This is the trickiest part of the frontend test setup, worth understanding in depth.

`font-config.ts` calls `Inter(...)`, `Poppins(...)` etc. **at module load time** (top level, outside any function):

```ts
// font-config.ts
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
```

The real `Inter(...)` from Next.js writes font metadata and CSS to the filesystem as part of the build pipeline. Outside of a Next.js build context, it crashes.

**Problem:** When any test file imports `apply-branding.ts`, which imports `./font-config`, which imports `next/font/google`, Node tries to execute `Inter(...)` immediately — before your test even runs. This is called a **module-level side effect**.

**Backend analogy:** Imagine a NestJS service whose constructor connects to the database immediately (`new DatabaseService()` → instant connection attempt). If you import it in a test without a mock, it tries to connect to a real database before you can intercept it.

**Solution — module alias in `vitest.config.ts`:**

```ts
// vitest.config.ts
resolve: {
  alias: {
    'next/font/google': path.resolve(__dirname, '__mocks__/next-font-google.ts'),
  },
}
```

This replaces `next/font/google` globally for the entire test suite — not just in one test file. Whenever anything imports `next/font/google`, Vitest silently swaps it for our mock:

```ts
// __mocks__/next-font-google.ts
const font = (id: string) => (): { variable: string; className: string } => ({
  variable: `--font-${id}`,
  className: `font-${id}`,
});

export const Inter = font('inter');    // Inter('latin') returns { variable: '--font-inter', className: 'font-inter' }
export const Poppins = font('poppins');
// ...
```

The mock returns the same shape as the real thing (`variable`, `className`), so all code that uses it still works — but no filesystem writes happen.

---

### 16. Per-Test Mocking with `vi.mock()`

For things that don't need a global alias — like `next/cache` and `next/navigation` — we mock per test file with `vi.mock()`:

```ts
// route.spec.ts
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// After this, any import of 'next/cache' in this file (and in the code under test)
// gets the mock version.
import { revalidatePath } from 'next/cache';
```

**Key rule: `vi.mock()` is hoisted.** Even though it's written after the `import` statements in your file, Vitest moves it to the very top before any imports execute. This is the same behaviour as Jest's `jest.mock()` — it's a deliberate design decision so the mock is in place before the module under test loads.

**Checking mock calls:**

```ts
const mockRevalidatePath = vi.mocked(revalidatePath);

it('calls revalidatePath with the correct path', async () => {
  await GET(makeRequest('tenant-a', VALID_SECRET));
  expect(mockRevalidatePath).toHaveBeenCalledWith('/tenant-a', 'page');
});
```

`vi.mocked()` is a type helper — it takes a value you know is a mock and types it as `MockInstance<...>`, giving you `.toHaveBeenCalledWith()` etc. on the `expect()` matcher.

---

### 17. Coverage and SonarCloud

**How coverage works:**

When you run `pnpm test:cov`, Vitest instruments every line of your source files and tracks which lines execute during tests. At the end it generates `coverage/lcov.info` — a standard format that SonarCloud, Codecov, and most CI tools understand.

```
pnpm --filter @ikaro/web test:cov
→ apps/web/coverage/lcov.info  (222 lines, records which lines were hit)
```

**How SonarCloud picks it up:**

`sonar-project.properties` tells SonarCloud where to find the coverage report:
```properties
sonar.javascript.lcov.reportPaths=apps/backend/coverage/lcov.info,apps/bff/coverage/lcov.info,apps/web/coverage/lcov.info
```

In CI (`pr-quality.yml`), the SonarCloud job runs all three `test:cov` commands before scanning:
```yaml
- name: Generate coverage reports
  run: |
    pnpm --filter @ikaro/backend test:cov
    pnpm --filter @ikaro/bff test:cov
    pnpm --filter @ikaro/web test:cov   # added
```

**Why the quality gate was failing before this PR:**

`apps/web` was already listed in `sonar.sources` (SonarCloud could see the files), but there was no coverage report for it. SonarCloud treats files with no coverage data as 0% covered. New code with 0% coverage → Quality Gate fails.

**Differential coverage — why you don't need 80% everywhere today:**

`sonar.newCode.referenceBranch=main` tells SonarCloud to only enforce the ≥80% gate on code that changed since the last main commit. Legacy files with no tests don't block the PR. Only the lines YOU changed in this PR need to be covered.

This is the same principle as the backend: you don't need to test the whole codebase before shipping a feature — you need to test the code you're adding.

**What's not covered and why that's OK:**

`[slug]/layout.tsx` and `[slug]/page.tsx` are not covered by unit tests. SonarCloud sees them as uncovered lines. But:
1. They're server components — Playwright covers them at E2E level
2. The differential gate only cares about coverage on **new** lines, and the definition of "new" is relative to main
3. Once M16 Playwright tests land, these paths get covered at integration level

---

---

---

<a name="m12-s04"></a>
## M12-S04–S06 — Module Components: Anatomy, Props, Component Testing

---

### 18. React Component Anatomy — Props and Interfaces

Every hotsite module is a React component. Here's the anatomy:

```tsx
// components/hotsite/HeroModule.tsx

interface HeroModuleProps {
  readonly data: HeroModuleData;  // the module's config from the manifest
  readonly slug: string;          // the tenant's slug, used for booking links
}

export function HeroModule({ data, slug }: HeroModuleProps) {
  return (
    <section style={{ backgroundColor: 'var(--ba-secondary)' }}>
      <h1>{data.title}</h1>
      {data.subtitle && <p>{data.subtitle}</p>}
      <a href={data.ctaTarget === 'booking' ? '#booking-form' : '#service-list'}>
        {data.ctaLabel}
      </a>
    </section>
  );
}
```

**Key rule — every prop must be `readonly`:** SonarCloud rule S6759 fires on every prop that isn't marked `readonly`. This is a TypeScript best practice — components should not mutate their input. The linter enforces it; failing to add `readonly` blocks the PR.

```ts
// ✓ correct
interface HeroModuleProps {
  readonly data: HeroModuleData;
  readonly slug: string;
}

// ✗ wrong — SonarCloud S6759 BLOCKER
interface HeroModuleProps {
  data: HeroModuleData;
  slug: string;
}
```

**Backend analogy:** Think of `readonly` props like an immutable DTO. The component receives data and renders it — it should never modify what it received, the same way a controller method shouldn't mutate its input DTO.

---

### 19. Conditional Rendering — The `&&` Pattern

In JSX, `{condition && <Element />}` renders `<Element />` only when `condition` is truthy. It's the most common pattern for optional content:

```tsx
{data.subtitle && <p className="mt-2">{data.subtitle}</p>}
//       ↑                    ↑
//  if this is truthy    render this
```

**Watch out for `0`:** If your condition is a number that could be `0`, use `!!` or an explicit comparison. `{items.length && <List />}` would render the literal `0` character when the array is empty (because `0 && anything = 0`, and React renders `0` as text). Use `{items.length > 0 && <List />}` instead.

**The ternary for either/or:**

```tsx
{data.ctaTarget === 'booking'
  ? <a href="#booking-form">{data.ctaLabel}</a>
  : <a href="#service-list">{data.ctaLabel}</a>}
```

---

### 20. Why Module Components Are Testable But Pages Aren't

This distinction matters and it's easy to get wrong.

**Page and layout files** (`app/[slug]/page.tsx`, `app/[slug]/layout.tsx`) are **not unit-tested**. Why? They call Next.js runtime APIs:

- `await params` — the params Promise is resolved by Next.js's router
- `notFound()` — throws a special Next.js error that's caught by the framework
- `generateMetadata` — a special Next.js export hook
- `cookies()`, `headers()` — Next.js server utilities

These only work inside a real Next.js server. Trying to call them in Vitest produces errors or undefined behavior. Testing pages is done via **Playwright E2E tests** that spin up a real Next.js dev server.

**Module components** (`components/hotsite/HeroModule.tsx`, etc.) are **synchronous functions** that receive already-resolved props and return JSX. No Next.js APIs. No async. No routing. They're as testable as any pure function. You give them props, you get markup back, you assert on the markup. That's it.

**The mental model:** A page is a controller that calls services and builds a response. A module component is a pure rendering function. You test controllers with integration tests (real server), not unit tests. You test rendering functions with unit tests (just call the function).

---

### 21. Component Testing with `@testing-library/react`

Testing Library renders components in a fake browser DOM (`jsdom`) and gives you queries to find elements in the result.

**The `// @vitest-environment jsdom` directive:** Every component test file must declare `// @vitest-environment jsdom` on line 1. Without this, the test runs in Node (no DOM), and `document` doesn't exist. The `jsdom` environment creates a fake DOM in memory.

```ts
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { HeroModule } from './HeroModule';

it('renders the title', () => {
  render(<HeroModule data={validData} slug="lavacar" />);
  expect(screen.getByRole('heading')).toHaveTextContent('Bem-vindo');
});
```

**`render()`** mounts the component into the fake DOM. You don't need to assert on the return value — just call it and then query the DOM with `screen`.

**`screen` queries — the most useful ones:**

| Query | What it finds | Throws if not found? |
|---|---|---|
| `screen.getByRole('heading')` | element with that ARIA role | yes |
| `screen.getByText('Bem-vindo')` | element with exact text | yes |
| `screen.queryByText('Foo')` | same, but returns `null` instead of throwing | no |
| `screen.getAllByRole('img')` | all elements with that role (returns array) | yes |

**Prefer role queries:** `getByRole('heading')`, `getByRole('link')`, `getByRole('img')`, `getByRole('button')`. These test what the user (and screen readers) actually see — they're more robust than querying by CSS class or test ID.

**DOM matchers from `@testing-library/jest-dom`:**

```ts
expect(element).toBeInTheDocument();    // is it in the DOM at all?
expect(element).toHaveTextContent('x'); // does its text include 'x'?
expect(element).toHaveAttribute('href', '/booking'); // attribute check
expect(element).not.toBeInTheDocument(); // negative assertion
```

**Critical import detail:** You must import `@testing-library/jest-dom/vitest` (not `@testing-library/jest-dom`) in `vitest.setup.ts`. The `/vitest` entrypoint registers the matchers for Vitest's `expect()`. The bare import is Jest-only — TypeScript won't error, but `toBeInTheDocument()` will not be typed correctly.

---

### 22. Querying the DOM in Tests — Beyond Text and Role

Sometimes you need to find elements by data attributes or CSS selectors:

```ts
// Find by data attribute
const wrapper = document.querySelector('[data-gallery-expanded]');

// Find by querySelector (use sparingly — prefer semantic queries)
const extras = document.querySelectorAll('[data-gallery-extra]');

// Assert on attribute value
expect(wrapper).toHaveAttribute('data-gallery-expanded', 'false');
```

`document.querySelector` searches the entire rendered DOM. Use it when no semantic role/text query fits — for example, when testing behavior driven by custom data attributes (like the gallery expand/collapse pattern).

**`userEvent` for interactions:**

```ts
import userEvent from '@testing-library/user-event';

it('expands when clicking Ver mais', async () => {
  const user = userEvent.setup();
  render(<GalleryModule data={data} slug="x" />);

  await user.click(screen.getByRole('button', { name: 'Ver mais' }));

  expect(document.querySelector('[data-gallery-expanded]'))
    .toHaveAttribute('data-gallery-expanded', 'true');
});
```

`userEvent.click()` is async (it simulates real browser events including pointer down, pointer up, click). Always `await` it. Use `userEvent.setup()` to create an instance — it manages internal state across multiple interactions in the same test.

---

### 23. The `next/image` Mocking Problem

`next/image` has the same module-evaluation side-effect problem as `next/font/google`. The real `next/image` optimisation pipeline calls into Next.js internals at import time — it crashes outside a Next.js build context.

The fix is the same pattern: **global alias in `vitest.config.ts`**:

```ts
// vitest.config.ts
resolve: {
  alias: {
    'next/font/google': path.resolve(__dirname, '__mocks__/next-font-google.ts'),
    'next/image':       path.resolve(__dirname, '__mocks__/next-image.ts'),  // same pattern
  },
},
```

```ts
// __mocks__/next-image.ts
import React from 'react';
const MockImage = ({
  src, alt, fill: _, priority: __, sizes: ___, ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string;
}) => React.createElement('img', { src, alt, ...rest });
export default MockImage;
```

The mock renders a plain `<img>` tag. Tests can then use `screen.getByRole('img')` and `toHaveAttribute('src', '...')` on it. The `fill`, `priority`, `sizes` props are stripped because plain `<img>` doesn't understand Next.js-specific props.

**Rule:** Both `next/font/google` and `next/image` need global aliases (not per-file `vi.mock()`). The reason is timing — they're executed at module evaluation time, before any per-file mock can be installed.

---

---

<a name="m12-islands"></a>
## M12-S04–S06 (cont.) — The Islands Pattern, LCP, Client/Server Split

---

### 24. LCP — Largest Contentful Paint

**LCP** is a Core Web Vital — Google's metric for how fast the most important visible element on the page loads. For a hotsite, the "largest content" is typically the hero image or the gallery. Google uses LCP as a ranking signal for search results.

If your gallery images are rendered client-side (inside a `'use client'` component), this is what happens:
```
1. Browser receives HTML (no images in it — the client component is just a <div>)
2. Browser downloads your JavaScript bundle
3. JavaScript runs, component renders, image tags appear in the DOM
4. Browser starts downloading images
5. Images appear — LCP is measured here
```

Steps 2–4 add seconds of delay. On mobile with a slow connection, LCP can easily hit 5+ seconds, which Google considers "poor".

If images are rendered **server-side**, the HTML the browser first receives already contains the `<img>` tags. The browser can start downloading images immediately — parallel with JS, not after it.

**Why this matters for `GalleryModule`:** The gallery is often the main visual content of a car wash hotsite. Keeping images server-rendered means they start loading immediately on first byte of HTML. This is the "LCP optimization" that drove the GalleryModule refactor.

---

### 25. The Islands Pattern — Server Renders, Client Handles

The islands pattern is the core architectural decision for interactive module components:

**Rule:** Server component renders all content (images, text, structure). A thin `'use client'` component handles only the interactive state. The server component passes its rendered output as `children` to the client wrapper.

**Concrete example — GalleryModule + GalleryGrid:**

```
GalleryModule.tsx  (server — no 'use client')
  ↳ renders all <img> elements, adds data-gallery-url attrs
  ↳ passes them as children to GalleryGrid (the thin client wrapper)

GalleryGrid.tsx  (client — 'use client')
  ↳ receives pre-rendered image elements as children
  ↳ manages: expanded/collapsed state, lightbox open/close
  ↳ renders children directly — no awareness of image internals
```

```tsx
// GalleryModule.tsx (server)
export function GalleryModule({ data }: { data: GalleryModuleData }) {
  if (!data.images.length) return null;

  const images = data.images.map((img, i) => (
    <a
      key={img.url}
      data-gallery-url={img.url}
      data-gallery-caption={img.caption}
      data-gallery-extra={i >= data.maxVisible ? '' : undefined}
    >
      <img src={img.url} alt={img.caption ?? ''} loading="lazy" />
    </a>
  ));

  return (
    <GalleryGrid maxVisible={data.maxVisible} totalImages={data.images.length}>
      {images}  {/* server-rendered content passed as children */}
    </GalleryGrid>
  );
}

// GalleryGrid.tsx (client)
'use client';
export function GalleryGrid({ children, maxVisible, totalImages }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div data-gallery-expanded={expanded}>
      {children}  {/* server-rendered images appear here — in SSR HTML */}
      {totalImages > maxVisible && !expanded && (
        <button onClick={() => setExpanded(true)}>Ver mais</button>
      )}
    </div>
  );
}
```

**The key insight:** Children passed from a server component to a client component are already rendered in the SSR HTML. The browser receives `<img>` tags in the first byte of HTML. The client component (`GalleryGrid`) doesn't need to know anything about the images — it just holds and displays its children.

**Backend analogy:** The server component is like your controller that fetches data and builds a response. The client component is like a decorator that adds interactivity around that response. The controller doesn't need the decorator to function — and the decorator doesn't need to understand the controller's domain logic.

---

### 26. CSS Data-Attribute Pattern — Show/Hide Without Re-rendering

Instead of using React state to add/remove images from the DOM, we use a CSS pattern:

1. All images are **always** in the DOM (rendered by the server component)
2. Extra images get `data-gallery-extra` attribute
3. A CSS rule hides them based on the wrapper's `data-gallery-expanded` attribute

```css
/* globals.css */
[data-gallery-expanded='false'] [data-gallery-extra] {
  display: none;
}
```

When the user clicks "Ver mais":
```tsx
setExpanded(true)
// → React re-renders GalleryGrid wrapper with data-gallery-expanded="true"
// → CSS rule no longer matches
// → extras become visible
```

**Why not just add images to state when "Ver mais" is clicked?** Because then:
- Images wouldn't be in the SSR HTML (crawlers and SSR can't see them)
- LCP is worse (images download after JS runs)
- Tests become harder (different DOM structures before/after click)

**Why does `display: none` prevent image download?** Browsers don't download images that are `display: none`. They're in the HTML (good for SEO), but the browser skips downloading them until they become visible. This means extras don't cost anything on page load — they only download when the user expands.

**Backend analogy:** This is like returning all data in a response but setting a flag on records the client shouldn't display initially. The data is there, the client just doesn't show it yet. The "query" to change what's visible is a CSS attribute change instead of a new API call.

---

### 27. Event Delegation — One Handler for Many Elements

When you have many clickable elements (8 gallery images), attaching an `onClick` to each is wasteful. **Event delegation** uses one handler on a parent element instead:

```tsx
// ✗ one handler per image (8 functions)
{images.map(img => (
  <img onClick={() => openLightbox(img.url)} src={img.url} />
))}

// ✓ one handler on the wrapper
<div onClick={handleClick}>
  {children}  {/* could be 100 images */}
</div>
```

The trick is reading which element was clicked:

```tsx
function handleClick(e: React.MouseEvent<HTMLDivElement>) {
  const target = (e.target as HTMLElement).closest('[data-gallery-url]');
  if (!target) return;  // clicked on wrapper, not an image

  const url = target.getAttribute('data-gallery-url') ?? '';
  const caption = target.getAttribute('data-gallery-caption') ?? '';
  openLightbox({ url, caption });
}
```

`e.target.closest('[data-gallery-url]')` walks up the DOM tree from the clicked element until it finds an ancestor with that attribute (or returns `null` if it reaches the root). This handles clicks on the `<img>` itself (which bubbles up to the `<a>` parent), clicks on the `<a>` (direct), and clicks on the wrapper (returns null).

**Why this works across server-rendered children:** React's synthetic event system is installed at the document root. Events bubble up from any DOM element — including ones that were rendered server-side and passed as `children`. The `onClick` on the client component `<div>` fires for clicks on server-rendered descendants, exactly as if they were rendered in the client component.

**Backend analogy:** Event delegation is like a single middleware that inspects the request to decide which handler to call, instead of mounting a separate middleware for each route.

---

### 28. The `<dialog>` Element and the Tailwind Display Bug

HTML has a native `<dialog>` element for modals/lightboxes. You show it with `dialogRef.current.showModal()` and hide it with `dialogRef.current.close()`. The browser handles accessibility, focus trapping, and keyboard close (Escape key) automatically.

**The bug:** The browser's default CSS says `dialog { display: none }`. When you open a dialog, the browser adds the `open` attribute and its stylesheet switches to `display: block`.

Tailwind's utility `flex` compiles to `display: flex` in your stylesheet. **Your stylesheet has higher priority than the browser's default.** So `<dialog className="flex ...">` always has `display: flex`, even when the dialog is closed. The browser's `display: none` never wins.

```tsx
// ✗ WRONG — dialog is always visible as fullscreen transparent overlay
<dialog className="flex items-center justify-center ...">

// ✓ CORRECT — display:flex only applies when dialog has 'open' attribute
<dialog className="open:flex items-center justify-center ...">
```

Tailwind's `open:` variant generates:
```css
dialog[open].open\:flex { display: flex; }
```

The `[open]` attribute selector means it only applies when `showModal()` has been called. Closed dialog = no `open` attr = no `display` override = browser default `display: none` = hidden. ✓

**Why this bug is dangerous:** The `<dialog>` was invisible (transparent, no background). But it was `position: fixed; inset: 0` — covering the entire page. Its backdrop click handler intercepted every click. The entire page appeared non-interactive. No error in the console. No obvious cause. This is why it's in ANTI_PATTERNS.md.

**Rule:** Never put `flex`, `block`, `grid`, or any display utility directly on a `<dialog>`. Always use `open:flex`.

---

### 29. When NOT to Use the Islands Pattern

The islands pattern (server renders content, client handles interaction) is the default. But it's not always right.

**When to skip islands and make the whole module `'use client'`:**

| Module | Reason to skip islands |
|---|---|
| `BookingForm` | Multi-step form with complex controlled state — every element is interactive, server rendering adds complexity with no benefit |
| `TestimonialsCarousel` | The carousel's core behavior (slide positioning, touch events, auto-play) wraps the testimonial cards themselves — splitting would mean passing cards as children to a component that needs to measure their widths. The complexity cost outweighs the SEO benefit (testimonial text isn't indexed like images anyway) |

**The question to ask:** Is the majority of the module's content static-renderable, with only a small piece that needs interactivity? If yes → islands pattern. If the interactive logic is deeply intertwined with the content structure → make the whole module client.

Testimonial cards are not LCP candidates (no images), and their text is still in the HTML even with client rendering (React server renders client components on first load). So `TestimonialsCarousel` being fully client is a valid choice — the tradeoff is different from `GalleryModule` where images are the main content.

---

---

<a name="m12-caching"></a>
## M12-S04–S06 (cont.) — Next.js Caching Deep Dive

---

### 30. Two Independent Caches in Next.js

Next.js has two separate caching layers for server-rendered pages. They look similar but are completely independent:

**Data Cache** — caches individual `fetch()` responses:
```ts
fetch(url, { next: { revalidate: 300 } })
// This specific API response is cached for 300 seconds
```

**Full Route Cache** — caches the entire rendered HTML page:
```ts
// page.tsx
export const revalidate = 300;
// The entire HTML output for this route is cached for 300 seconds
```

If these have different values, you get inconsistent behavior. The HTML might be cached for 60 seconds, but the data it was built from is cached for 300 seconds. Or vice versa.

**Our solution — one shared constant:**

```ts
// apps/web/lib/hotsite/revalidate.ts
export const HOTSITE_REVALIDATE_SECONDS = 300;
```

**Important constraint:** `export const revalidate` in `page.tsx` / `layout.tsx` **must be a literal**. Next.js statically extracts segment config using AST parsing — it does not execute the module, so imported variables are not resolved. This causes a build failure with "Invalid segment configuration export detected."

```ts
// page.tsx — MUST be a literal, not an imported variable
// Keep in sync with HOTSITE_REVALIDATE_SECONDS in lib/hotsite/revalidate.ts manually.
export const revalidate = 300;

// lib/api/platform.ts — fetch() is runtime code, so the constant works fine here
import { HOTSITE_REVALIDATE_SECONDS } from '@/lib/hotsite/revalidate';
fetch(url, { next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS } });
```

**Rule:** `HOTSITE_REVALIDATE_SECONDS` is used in `fetch()` calls only. Pages use the literal `300` with a comment pointing to the constant. Change the constant and the literal together when updating the TTL.

---

### 31. The `isDev ? 0` Guard

The `isDev` check in fetch calls disables caching in development mode:

```ts
const isDev = process.env.NODE_ENV === 'development';
fetch(url, { next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS } });
```

`revalidate: 0` means "never cache — always fetch fresh". Without this, you'd change a module's data in the local DB, refresh the browser, and see the old cached version. Every local edit would require cache busting (`pnpm dev` restart or manual fetch invalidation).

In production, `NODE_ENV=production` and caching is enabled. In development, `NODE_ENV=development` and caching is disabled. Simple.

**Backend analogy:** This is like having `CACHE_ENABLED=false` in your `.env` for local development, so you can iterate quickly without flushing Redis every time you change data.

---

### 32. CDN Caching — The Future Layer

The Next.js caches (`export const revalidate` and `next: { revalidate }`) are **server-side caches**. The Next.js server stores the rendered HTML or API response in memory. Every visitor's first request to a new slug still hits the Next.js server.

A **CDN** (Content Delivery Network) sits in front of the Next.js server and caches at the network edge — geographically close to the visitor. First request from Brazil goes to Brazil edge → cached there → next request from Brazil served from Brazil, not from the server.

For a CDN to work, the page must be cacheable. The BFF already sets `Cache-Control: public, max-age=300` on manifest responses. Once CDN infra is in place (post-MVP, see `docs/22-TECH_STACK_DECISIONS.md`), the edge can cache the full HTML output.

**Why our changes in this session made CDN caching safe:** The manifest contains image URLs. If those were expiring pre-signed URLs (like private booking photos), the HTML cached at the CDN edge would contain URLs that expired while cached. Visitors would see broken images. Since M12-S10, hotsite images are permanent public URLs — safe to cache at any layer indefinitely.

---

---

<a name="m12-validation"></a>
## M12-S04–S06 (cont.) — Data Validation Gate and Social Links Architecture

---

### 33. The Module Data Validation Gate (`module-schemas.ts`)

The hotsite manifest comes from the database. Admins can configure modules via the dashboard. The database can contain:
- Valid data stored correctly
- Malformed data from a bug in the admin UI
- Data from an old schema version that no longer matches the current interface

If one module in the `layout[]` array has malformed data and we try to render it, the component crashes — and Next.js will show an error page for the **entire hotsite**. A bug in one module takes down the whole site.

**The validation gate:**

```ts
// lib/hotsite/module-schemas.ts
export function isValidModuleData(type: HotsiteModuleType, data: unknown): boolean {
  const schema = MODULE_DATA_SCHEMAS[type];
  return schema ? schema.safeParse(data).success : true;
}
```

```tsx
// page.tsx
{manifest.layout
  .filter(m => m.enabled)
  .map((m) => {
    if (!isValidModuleData(m.type, m.data)) {
      return null;  // skip this module, continue rendering others
    }
    // render the module...
  })}
```

If `HeroModule`'s data is malformed, that module is silently skipped. The rest of the page renders normally.

**Every module type must have a registered schema.** Without a schema, `isValidModuleData` returns `true` for any data (including `null`, `undefined`, `{}`), and the component receives garbage props and crashes. When you add a new module (step 3 in the developer checklist), adding the Zod schema to `MODULE_DATA_SCHEMAS` is mandatory before shipping.

```ts
// module-schemas.ts
const MODULE_DATA_SCHEMAS: Partial<Record<HotsiteModuleType, z.ZodType>> = {
  HERO: HeroModuleDataSchema,
  SERVICE_LIST: ServiceListModuleDataSchema,
  GALLERY: GalleryModuleDataSchema,
  TESTIMONIALS: TestimonialsModuleDataSchema,
  ABOUT: AboutModuleDataSchema,
  CONTACT: ContactModuleDataSchema,  // ← added in this session (was missing)
};
```

**The `satisfies z.ZodType<XxxModuleData>` pattern:** Each schema uses TypeScript's `satisfies` operator to ensure the Zod schema is compatible with the TypeScript interface. If you add a field to `HeroModuleData` in `@ikaro/types` and forget to add it to `HeroModuleDataSchema`, TypeScript gives you a compile error at the schema definition — not a runtime crash at the user.

**Backend analogy:** This is your `ZodValidationPipe`. Instead of validating incoming HTTP request bodies, you're validating database-stored JSON that's about to be rendered. Same principle — validate at the boundary, skip/reject rather than crash.

---

### 34. Social Links Architecture — Where Data Lives

During the `ContactModule` implementation, a design question arose: *where do social links (WhatsApp, Instagram, Facebook) belong?*

**Option A (what we tried first):** Store social links in `ContactModuleData` alongside `showWhatsapp`, `showAddress`, etc.

**Problem:** The admin would configure social links every time they configure the Contact module. But these links are business identity information — they shouldn't change per-module. An admin might have five page variations with different Contact module configurations but the same WhatsApp number. Managing them in the module means updating five places.

**Option B (what we built):** Social links live in `tenants.settings.business_info.social_links` — the same place as phone, email, and address.

```
tenants.settings.business_info {
  phone: "11 99999-9999",
  email: "contato@lavacar.com.br",
  address: { ... },
  social_links: {
    whatsapp: "11987654321",
    instagram: "https://instagram.com/lavacar",
    facebook: null
  }
}
```

The admin edits them once on the tenant settings page (UC-026). `GetHotsiteManifestUseCase` includes them in the `business` field on the manifest response:

```
manifest.business.socialLinks.whatsapp  → used in wa.me/ links
manifest.business.socialLinks.instagram → rendered as a link
manifest.business.socialLinks.facebook  → rendered as a link (when not null)
```

`ContactModuleData` only carries display preferences (`showWhatsapp: boolean`) — not values. The `ContactModule` component receives **both** `data` (preferences) and `business` (values) as separate props.

**The principle:** Content (what to show) lives in module data. Business identity (actual values) lives in tenant settings. Never mix the two. Same split as the address and phone number — the module says "show address: yes", the tenant settings say what the address actually is.

---

### 35. Phone Number Validation — Only When It Matters

When we added social links, a question came up: should we validate `instagram`, `facebook`, and `whatsapp`?

- `instagram` — a URL or a handle (e.g. `@lavacar` or `https://instagram.com/lavacar`). There's no canonical format. The admin types whatever they want and the frontend renders it as a link. **No validation needed.**
- `facebook` — same as Instagram. Free-form. **No validation needed.**
- `whatsapp` — used programmatically in `https://wa.me/<number>`. The `wa.me/` deep link only works with a valid phone number (country code + digits, no spaces). If the admin enters garbage, the link is broken for every visitor. **Validation needed.**

```ts
// tenant-settings.vo.ts
private static validateSocialLinks(socialLinks: SocialLinks | null): void {
  if (socialLinks == null) return;
  if (socialLinks.whatsapp != null && !PhoneNumber.isValid(socialLinks.whatsapp)) {
    throw new PlatformDomainError(
      'business_info.social_links.whatsapp must be a valid phone number',
    );
  }
}
```

**The rule:** Validate data that is used programmatically (in a URL, in a `wa.me/` link, in a formula). Don't validate data that is displayed verbatim to the user (they see exactly what the admin typed). This keeps validation purposeful rather than mechanical.

**Backend analogy:** You validate an email address when you're going to send email to it. You don't validate a "display name" field because you're just showing it back to the user — any string is valid.

---

<a name="m12-s07"></a>
## M12-S07 — Booking Form: Multi-Step State, Controlled Inputs, Adapters, Uploads, Errors

---

### 36. Lifting State Up — Multi-Step Forms

The booking form has four steps: pick services, pick a date/time, enter personal info, confirm. Each step is its own component (`ServiceSelectionStep`, `AvailabilityCarousel`+`SlotPicker`, `PersonalInfoStep`, `ConfirmationStep`) — but none of them holds its own state. **`BookingForm.tsx` owns everything**:

```tsx
type Step = 1 | 2 | 3 | 4;

export function BookingForm({ slug, services }: BookingFormProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');

  return (
    <div>
      {step === 1 && (
        <ServiceSelectionStep
          services={services}
          selectedServiceIds={selectedServiceIds}
          onToggleService={toggleService}
          onNext={() => setStep(2)}
        />
      )}
      {step === 3 && (
        <PersonalInfoStep value={personalInfo} onChange={setPersonalInfo} onNext={() => setStep(4)} />
      )}
      {/* ...steps 2 and 4 */}
    </div>
  );
}
```

Each step component is a **pure function of its props**: given `services` + `selectedServiceIds` + a couple of callbacks, `ServiceSelectionStep` always renders the same thing. It never reaches "sideways" into another step's data, and it never remembers anything between renders that `BookingForm` doesn't already know.

This is called **"lifting state up"** — when two or more components need to share or coordinate state, you move that state to their nearest common parent (here, all four steps share `personalInfo`, `selectedServiceIds`, etc., so it all lives in `BookingForm`).

**Backend analogy:** Think of `BookingForm` as a saga/orchestrator and each step as a stage in a workflow. The orchestrator holds the *entire workflow context* (like a transaction or a process-manager's state); each stage receives only the slice of context it needs, does its work, and reports back ("call `onNext`" ≈ "emit a `StageCompleted` signal"). The stage itself is stateless between invocations — exactly like a stateless use case that receives everything it needs as DTO fields.

---

### 37. Controlled Inputs — The Component's State IS the Source of Truth

Every `<input>` in `PersonalInfoStep`/`AddressFields` looks like this:

```tsx
<input
  type="email"
  value={value.contactEmail}
  onChange={(e) => onChange({ ...value, contactEmail: e.target.value })}
/>
```

This is a **controlled input**. The displayed value (`value={value.contactEmail}`) always comes from React state — never from the DOM itself. Every keystroke fires `onChange`, which produces a *new* `PersonalInfoValue` object and hands it to `setPersonalInfo` (via the `onChange` prop chain back to `BookingForm`). React re-renders, the input's `value` prop is the new string, and the loop continues.

The opposite — an **uncontrolled input** — lets the DOM hold the value (you'd read it later via a `ref`). Ikaro's forms are controlled throughout, because controlled state is what lets `BookingForm` answer questions like "is Step 3 valid yet?" or "does any selected service require a pickup address?" by just *looking at state* — no querying the DOM.

`PersonalInfoValue` (`lib/booking/personal-info.ts`) is the shape of that state:

```ts
interface PersonalInfoValue {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: Address;       // all fields default to '', "filled" checked via isAddressFilled()
  pickupAddress: Address;
  photoFilePaths: string[];
}
```

**Backend analogy:** A controlled input is like binding a single field of an incoming request directly onto a DTO as it's parsed — except here "parsing" happens on every keystroke, and the "DTO" is *also* what's rendered back to the screen immediately, before any submission happens. There's no separate "form model" vs. "display model" — they're the same object.

---

### 38. The Adapter Pattern on the Frontend — `AddressLookup`

The CEP (Brazilian postal code) autofill needs to call ViaCEP, a third-party API. Rather than calling `fetch('https://viacep.com.br/...')` directly inside `AddressFields`, the codebase defines a **port**:

```ts
// lib/address/address-lookup.port.ts
export interface AddressLookup {
  lookup(cep: string): Promise<AddressLookupResult | null>;
}
```

...and an **adapter** that implements it against the real API:

```ts
// lib/address/viacep-address-lookup.adapter.ts
export const viaCepAddressLookup: AddressLookup = {
  async lookup(cep) {
    const digits = digitsOnly(cep);
    if (digits.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.erro || !data.logradouro) return null;
      return { street: data.logradouro, neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' };
    } catch {
      return null;   // network error → "couldn't autofill", never a blocking error
    }
  },
};
```

`AddressFields` depends on the **port**, with the real adapter as a default value:

```tsx
interface AddressFieldsProps {
  readonly addressLookup?: AddressLookup;   // defaults to viaCepAddressLookup
  // ...
}

export function AddressFields({ addressLookup = viaCepAddressLookup, ...rest }: AddressFieldsProps) {
  // calls addressLookup.lookup(cep) when an 8-digit CEP is entered
}
```

**Backend analogy:** This is exactly `IStorageService` / `GcsSignedUrlAdapter` — an interface plus a concrete implementation, swappable without touching the consumer. The difference is *how* the swap happens. On the backend, NestJS's DI container resolves a token (`STORAGE_SERVICE`) to a class at module-wiring time. The frontend has **no DI container** — so the "wiring" is just a default-valued function parameter. Production code calls `<AddressFields />` and gets `viaCepAddressLookup` for free; tests call `<AddressFields addressLookup={new InMemoryAddressLookup({...})} />` and get deterministic, network-free results. If Ikaro later adds a paid/Google-based lookup, only the adapter file and the default change — `AddressFields` and every caller stay untouched.

Notice the **error contract**: every failure mode (network error, CEP not found, malformed response) collapses to `null`. The caller's rule is simple — `null` means "couldn't autofill, the user types it manually." CEP lookup is a convenience, never a blocker.

---

### 39. The Signed-URL Upload Dance

`PhotoUpload` lets a customer attach "before" photos of their vehicle. The naive approach — `<input type="file">` → send the file bytes to your own backend → backend forwards to cloud storage — works, but doubles the data transfer (browser → your server → GCS) and ties up a backend request for however long the upload takes.

Instead, Ikaro reuses the **signed-URL upload pattern** already established for booking attachments (`docs/14-API_CONTRACTS.md`) — three requests for one file:

```ts
// 1. Ask the backend for a place to put the file (no file bytes sent yet)
const { signedUrl, filePath } = await createAttachmentSignedUrl(slug, file.name, file.type);

// 2. Upload the file bytes DIRECTLY to cloud storage — bypasses the backend entirely
await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

// 3. Tell the backend "this file exists at this path" by including filePath in the booking payload
beforeServicePhotoUrls.push(filePath);
```

Step 1's `signedUrl` is a URL with an embedded, time-limited cryptographic signature — GCS will accept a `PUT` to that exact URL for a short window (~15 minutes), without any other authentication. Step 2 goes **straight from the browser to GCS** — your backend's bandwidth and request-handling capacity are never involved in the actual file transfer. Step 3 is just metadata: the backend later validates (via `IStorageService.exists()`) that the file really was uploaded before trusting `filePath`.

**Backend analogy:** This is the same shape as a pre-signed S3/GCS upload URL in any backend system — the server's job is to *authorize* an upload, not to *proxy* it. The frontend's job is just sequencing: don't call step 3 until step 2 succeeds, and don't call step 2 until step 1 returns.

---

### 40. Typed Errors from `fetch()`

A crucial `fetch()` quirk: **it does not throw on HTTP error statuses.** A `404` or `409` response is a perfectly successful `fetch()` call — `res.ok` is `false`, but no exception is thrown. If you want a `409` to behave like an error in your code (so `try`/`catch` can route it), *you* have to throw.

`createBooking()` does exactly that, with a **custom error class** carrying the status code:

```ts
export class CreateBookingError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function createBooking(slug: string, payload: CreateBookingRequest) {
  const res = await fetch(`${BFF_URL}/bookings`, { method: 'POST', /* ... */ });
  if (!res.ok) throw new CreateBookingError(res.status, 'Failed to create booking');
  return res.json();
}
```

`BookingForm`'s submit handler then branches on **type and status together**:

```tsx
try {
  await createBooking(slug, payload);
  setStatus('success');
} catch (err) {
  if (err instanceof CreateBookingError && err.status === 409) {
    setStep2Error('Horário indisponível, escolha outro');
    setStep(2);                 // send the user back to re-pick a slot
    return;
  }
  setStatus('error');           // generic pt-BR message for everything else
}
```

A `409` here means "someone else booked this slot between Step 2 and Step 4" — it's *actionable*, so the UI routes the user back to the exact step where they can fix it. Every other failure gets a generic "try again" message.

**Backend analogy:** This is the mirror image of `mapXxxError(err: unknown): never` at your HTTP layer — except *inverted*. On the backend, you convert **domain errors → HTTP status codes**. Here, the frontend converts **HTTP status codes → typed errors**, which then drive **UI navigation** (which step to show) instead of an HTTP response. Same principle, opposite direction: a status code alone is too little information to act on; a typed error with an `instanceof` check is.

---

<a name="m12-s08"></a>
## M12-S08 — 404 vs "Coming Soon": Two Kinds of "Not Ready"

---

### 41. `notFound()` and the `not-found.tsx` Boundary Rule

Next.js gives you a function, `notFound()`, that you call from anywhere in a Server Component (a `page.tsx`, a `layout.tsx`, or a function they call) to say "render a 404 instead of whatever I was building":

```ts
// app/[slug]/layout.tsx
const manifest = await fetchManifest(slug).catch((err) => {
  if (err instanceof TenantNotFoundError) notFound();   // ⬅ stops rendering, signals "404"
  throw err;
});
```

Next.js then looks for the nearest `not-found.tsx` to render — but with one easy-to-miss rule: **a segment's own `not-found.tsx` cannot catch a `notFound()` thrown by that same segment's `layout.tsx`.** Only an *ancestor* segment's `not-found.tsx` can. Since the `notFound()` call above lives in `app/[slug]/layout.tsx`, a file at `app/[slug]/not-found.tsx` would **never** be reached for this case — it has to live at `app/not-found.tsx` (the parent of `[slug]`).

```
app/
├── not-found.tsx       ← catches notFound() thrown by [slug]/layout.tsx ✅
└── [slug]/
    ├── layout.tsx       ← throws notFound() for unknown slugs
    ├── not-found.tsx    ← would NOT catch the layout's notFound() ❌ (same segment)
    └── page.tsx
```

`app/not-found.tsx` has no access to any tenant's branding (the manifest fetch is what failed) — it's a static, Ikaro-branded page: `"Lavacar não encontrada"` + a link back to `<ikaro-domain>`.

**Backend analogy:** Picture a NestJS exception filter that's registered on a *parent module* but not the child module where the exception is thrown — and the rule is "only the parent's filter catches it, never a filter on the exact same module." The fix is the same instinct as exception filter placement: put the handler where it can actually intercept the signal, which sometimes means *up* a level, not at the same level.

---

### 42. Designing API Responses Around UI States, Not Just HTTP Codes

Before this story, **two completely different situations** produced the exact same response:

1. A visitor types a slug that has never existed → should be a `404`.
2. A real tenant exists, has a hotsite, but the admin hasn't hit "Publish" yet → ...also a `404`.

Both were `HotsiteNotPublishedError` → `404`. The problem: case 2 has *real branding data* (the admin already picked colors and fonts) that the frontend could use to render an on-brand "coming soon" page — but a `404` response throws that data away. The frontend literally cannot tell the two cases apart, so it can't render them differently.

The fix wasn't "add a new HTTP status code" — it was **"return `200` with less data"**:

```ts
// get-hotsite-manifest.use-case.ts
if (!config.isPublished) {
  return {
    branding: config.branding,     // real — needed for <Unavailable />'s var(--ba-*) tokens
    layout: [],                     // empty — don't leak draft module content publicly
    isPublished: false,
    business: { phone: null, email: null, address: null, socialLinks: null },
  };
}
```

`[slug]/page.tsx` then branches on `manifest.isPublished`:

```tsx
{manifest.isPublished ? <ModuleList layout={manifest.layout} /> : <Unavailable />}
```

**The general lesson:** an HTTP status code is a very coarse signal — it can only mean one of a handful of standard things. When your frontend needs to render *differently* depending on *why* something isn't available, that distinction has to live in the **response body**, not the status line. `isPublished: false` is one bit of information that a `404` can never carry, because by the time you're returning a `404` there's no body left to put it in.

**Backend analogy:** This is the same shape as choosing between throwing a domain error vs. returning a result object with a status field — sometimes "success, but here's why you can't do the thing" is more useful to the caller than an exception, because the caller (here, the page component) needs to *render something*, not just log a failure.

---

<a name="m12-s09"></a>
## M12-S09 — SEO: Metadata, Open Graph, JSON-LD, Sitemap, Robots

---

### 43. `generateMetadata()` — Per-Page Metadata Computed at Request Time

Every Next.js page can export metadata two ways. A **static** object:

```ts
export const metadata: Metadata = { title: 'Não encontrado — Ikaro' };
```

...or an **async function**, when the title/description depend on data that has to be fetched:

```ts
// app/[slug]/page.tsx
export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;                 // Next.js 16: params is a Promise
  const manifest = await fetchManifest(slug);     // same call page.tsx's render makes
  return buildHotsiteMetadata({ manifest, slug });
}
```

Next.js calls `generateMetadata` *before* rendering the page, and injects the returned `<title>`, `<meta>`, `<link rel="canonical">`, etc. into the `<head>` — you never touch the `<head>` element directly.

The crucial detail: `fetchManifest(slug)` uses `next: { revalidate: 300 }` (ISR — see §5/§6 earlier in this doc). Next.js's `fetch` cache means calling `fetchManifest(slug)` again — once from `generateMetadata`, once from the page component's render — **does not double the network request**. Both calls within the same request are deduplicated against the same cache entry.

`buildHotsiteMetadata()` (`lib/hotsite/seo.ts`) computes a sensible default — `"<Tenant Name> — Agendamento Online em <City>, <State>"` — but lets the tenant override it via `manifest.seo.title`/`manifest.seo.description` (new `jsonb` columns, editable from the admin dashboard in M13). Defaults mean every tenant gets *something* reasonable; ambitious tenants can write their own copy.

---

### 44. Open Graph and JSON-LD — Speaking to Robots, Not Just Browsers

Two pieces of metadata exist purely for **machines that aren't rendering your page for a human in real time**:

**Open Graph (`og:*` meta tags)** control the preview card that WhatsApp, Facebook, etc. show when someone pastes your URL into a chat — title, description, and a 1200×630 image:

```ts
openGraph: {
  title,
  description,
  url,
  siteName: 'Ikaro',
  locale: 'pt_BR',
  type: 'website',
  images: manifest.branding.logoUrl ? [{ url: manifest.branding.logoUrl, width: 1200, height: 630 }] : [],
}
```

For a car-wash business in Brazil, **link previews shared in WhatsApp groups are a primary discovery channel** — without `og:image`/`og:title`, a shared link shows as a bare URL.

**JSON-LD (`<script type="application/ld+json">`)** is structured data search engines parse to build "rich results" (e.g. a business card in search results with hours, address, rating):

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: manifest.tenant.name,
  url: `${SITE_URL}/${slug}`,
}) }} />
```

`dangerouslySetInnerHTML` is normally a red flag (it's React's escape hatch for injecting raw HTML, bypassing XSS protection) — which is exactly why `toJsonLdScript()` exists:

```ts
export function toJsonLdScript(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '<');
}
```

If a tenant's name contained the literal text `</script>`, plain `JSON.stringify` would emit it verbatim — and a browser parsing `<script type="application/ld+json">{"name":"</script><script>evil()"}</script>` would treat `</script>` as the **end of the JSON-LD block**, not as a string character, letting the rest become live, executable HTML. Escaping `<` to its Unicode form (`<`) is valid inside a JSON string but can never be interpreted as the start of a tag — the JSON-LD stays inert data.

**Backend analogy:** treat any tenant-controlled string (`tenant.name`, `business_info.*`) that ends up embedded in HTML the same way you'd treat user input going into a SQL query — it needs an escaping/encoding step at the boundary where it crosses from "data" into "markup."

---

### 45. File-Convention Routes — `sitemap.ts` and `robots.ts`

NestJS routes are explicit — `@Get('/something')`. Next.js has those too (`app/api/revalidate/route.ts` is one), but it **also** recognizes a handful of special filenames and turns them into specific, non-HTML response types automatically — no decorator, no registration:

```ts
// app/sitemap.ts → serves GET /sitemap.xml
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await fetchPublishedHotsiteSlugs();
  return items.map(({ slug, updatedAt }) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: updatedAt,
  }));
}

// app/robots.ts → serves GET /robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/auth'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

Next.js takes the returned JS object/array and serializes it into the XML/text format search engines expect. `fetchPublishedHotsiteSlugs()` calls a **new endpoint built for exactly this**, `GET /platform/published-hotsites` — backed by `ListPublishedHotsitesUseCase`, which joins `tenants` and `hotsite_configs` *within* the Platform context (same schema, not a cross-context join — see CLAUDE.md §7 "Cross-context data access") and filters to `is_active && is_published`.

**The rule that ties this all together:** every absolute URL anywhere in this system — `canonical`, `og:url`, JSON-LD `url`, sitemap entries — is built from one constant, `SITE_URL` (`lib/hotsite/seo.ts`), itself derived from `NEXT_PUBLIC_SITE_URL` with trailing slashes stripped. One env var, one constant, every URL consistent — change `NEXT_PUBLIC_SITE_URL` once when moving from `localhost:3000` to `<ikaro-domain>` and every generated URL updates.

---

<a name="m12-s10"></a>
## M12-S10 — Storage: Public vs Private Buckets, Cross-Service Revalidation

---

### 46. Public vs Private Storage — Two Buckets, Two Lifetimes

Up to this story, *every* uploaded image — a customer's "before" photo of their car, and a tenant's hero-section background image — went through the same pattern: private bucket, generate a **signed read URL** (time-limited, ~15 minutes) each time the image needs to be displayed.

That's the right call for booking photos — they're genuinely private, customer-specific data. It's the **wrong** call for a hero background image, which is:
- **Public by definition** — it's marketing material meant for anyone visiting the hotsite.
- **Cached** — the manifest containing `branding.logoUrl` is ISR-cached for 5 minutes (`Cache-Control: public, max-age=300`).

Put those two facts together and you get a real bug: a cached manifest response could embed a signed URL that **expires before the cache does**. A visitor hits the site during minute 4 of the cache window, gets a manifest with a signed URL generated at minute 0 — and the image is now a broken link, because the signature expired at minute ~15... actually worse, if the *signed URL itself* was generated once and cached, every subsequent cached response serves the *same* (eventually-expired) signature.

The fix: hotsite images get their **own public bucket**, with permanent, non-expiring addresses:

```ts
// IStorageService — pure string template, zero GCS API calls, no expiry
getPublicUrl(storagePath: string): string {
  return `${GCS_PUBLIC_BASE_URL}/${GCS_PUBLIC_BUCKET_NAME}/${storagePath}`;
}
```

| | Hotsite images (logo, hero bg, gallery) | Booking photos (before/after) |
|---|---|---|
| Bucket | **Public** (`allUsers: roles/storage.objectViewer`) | Private |
| URL | Permanent, computed via string template | Signed, regenerated, ~15 min expiry |
| Plays well with ISR? | Yes — URL never changes | N/A — never served through a cached response |

**Backend analogy:** this is the classic "two different consistency/access models for two different kinds of data" decision — like choosing eventual-consistency caching for a public read model but strong consistency for a private one. The *shape* of the data (an image URL) looks identical either way; the *guarantees* you need from it (does it expire? is it cacheable?) are completely different, and conflating them is where the bug hid.

---

### 47. Cross-Service Calls — The Backend Calling the Frontend

Normally data flows one way: browser → frontend → BFF → backend. This story adds a call going the **opposite direction**: when an admin publishes or unpublishes a hotsite, the **backend calls the frontend**, to tell Next.js "the cached page for this tenant is now stale, throw it away immediately" — rather than waiting up to 5 minutes for ISR's normal revalidation.

The frontend exposes a tiny API route for this:

```ts
// app/api/revalidate/route.ts
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');
  if (!secret || secret !== process.env.HOTSITE_REVALIDATE_SECRET) {
    return NextResponse.json({ message: 'Invalid or missing secret' }, { status: 401 });
  }
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ message: 'Missing slug' }, { status: 400 });

  revalidatePath(`/${slug}`, 'page');   // ← purges this page from Next.js's ISR cache
  return NextResponse.json({ revalidated: true, slug });
}
```

`revalidatePath` is the imperative counterpart to the `revalidate: 300` you've seen throughout this doc — instead of "stale after 300 seconds," it's "stale **right now**."

The backend's adapter (`FrontendRevalidationAdapter`) calls this route with a shared secret (`HOTSITE_REVALIDATE_SECRET`, same value configured on both sides — same convention as `PLATFORM_ADMIN_KEY`):

```ts
async revalidate(slug: string): Promise<void> {
  const url = new URL('/api/revalidate', this.frontendUrl);
  url.searchParams.set('slug', slug);
  try {
    const response = await fetch(url, {
      headers: { 'x-revalidate-secret': this.secret },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) this.logger.warn(`Hotsite revalidation failed for '${slug}'`, { status: response.status });
  } catch (err) {
    this.logger.warn(`Hotsite revalidation errored for '${slug}'`);
    // never rethrow — see below
  }
}
```

**The most important line in that snippet is the one that's *not* there: a `throw`.** `PublishHotsiteUseCase` calls `revalidate()` **after** persisting the publish — and the publish must succeed *regardless* of whether this call works. If the frontend is down, or the secret is misconfigured, or (as actually happened — M12-S10 shipped before M12-S03's route existed) the route doesn't exist yet and returns `404`, the admin's "Publish" click must still succeed. ISR's 5-minute fallback is the safety net; on-demand revalidation is purely an optimization for the common case.

**Backend analogy:** this is a **best-effort side effect with logging**, the same category as "send a Slack notification when an order ships" — if the notification fails, the order is still shipped. You log the failure for visibility, but a non-critical downstream call must never roll back or block the critical operation it's attached to.

---

<a name="m12-s11"></a>
## M12-S11 — Extending a Design-Token System Without Breaking Old Tenants

---

### 48. Additive Optional Fields — The Safe Way to Evolve a JSONB Schema

Recall from earlier in this doc: `HotsiteBranding` is a JSONB column, and `applyBranding()` maps its fields onto `--ba-*` CSS variables. This story adds two **new, optional** fields — `buttonBackgroundColor` and `buttonTextColor` — to fix a real visual bug (a `filled` button on a `var(--ba-primary)`-colored section background became invisible, because the button's fill matched its surroundings).

Two things make this addition "safe":

**1. No migration required.** Existing rows in `hotsite_configs` simply don't have these keys in their `branding` JSONB. `branding.buttonBackgroundColor` is `undefined` for every tenant that existed before this story — which is a perfectly valid value for an `?:` optional TypeScript field.

**2. Every code path has an explicit "unset" fallback that reproduces the old behavior exactly:**

```ts
function deriveButtonTokens(branding: HotsiteBrandingResponse): ButtonTokens {
  const base = BTN_STYLES[branding.buttonStyle] ?? BTN_STYLES.filled;
  const { buttonBackgroundColor, buttonTextColor } = branding;
  const isFilled = branding.buttonStyle === 'filled';
  const isOutline = branding.buttonStyle === 'outline';

  const bg = isFilled && buttonBackgroundColor ? buttonBackgroundColor : base.bg;
  const text = buttonTextColor ?? base.text;
  const hoverBg = isFilled ? bg : (buttonBackgroundColor ?? 'transparent');
  // ...
}
```

Read the `bg` line as: "if this is a `filled` button **and** the admin set an override, use it — **otherwise**, do exactly what we did before (`base.bg`)." Same for `text` (`?? base.text`) and `hoverBg` (`'transparent'` is today's resting-state value for non-`filled` buttons). Every existing tenant — whose `branding` object has neither field — produces **byte-identical CSS variable output** to before this story shipped. The new behavior only activates for tenants who *opt in* by setting a value through the admin dashboard.

This "optional field + explicit fallback that reproduces the old default" pattern is the general-purpose way to add a feature to a shared, persisted, schema-less (JSONB) structure without a migration and without a feature flag — the *absence of the field* **is** the feature flag.

**One sharp edge this story hit:** the value travels Frontend ⇄ **BFF** ⇄ Backend, and the BFF has its **own** `.partial()` Zod schema (`HotsiteBrandingBodySchema`) that re-validates the `PATCH` body before forwarding it on. Zod objects silently **strip unrecognized keys** by default. Add a field to the backend's schema and to `@ikaro/types`, but forget the BFF's separate schema, and `buttonBackgroundColor` vanishes at the BFF hop — backend tests pass (never see the field), frontend tests pass (it sends the field), and only an end-to-end "round trips through `PATCH` → `GET`" test catches the gap. **Whenever a shape crosses the BFF, there are usually two schemas describing it — both need updating together.**

---

<a name="m12-s12"></a>
## M12-S12 — Linting React: `react-hooks` and `jsx-a11y`

---

### 49. Linting React — Rules of Hooks and Accessibility

Two ESLint plugins were added to `apps/web/eslint.config.js` — both catch bug categories that are invisible to `tsc` (TypeScript happily compiles broken React code) and easy to miss in code review.

**`eslint-plugin-react-hooks`** enforces the "Rules of Hooks": hooks (`useState`, `useEffect`, `useMemo`, etc.) must be called unconditionally, at the top level, in the same order on every render — never inside an `if`, a loop, or after an early `return`. It also checks **dependency arrays**:

```tsx
useEffect(() => {
  fetchAvailability(slug, selectedDate, serviceIds).then(setSlots);
}, [slug, selectedDate]);  // ⚠️ react-hooks/exhaustive-deps: missing 'serviceIds'
```

Without this rule, `serviceIds` could change (the user goes back and toggles a service) without re-triggering the effect — `SlotPicker` would silently show slots for the *old* service selection. This is exactly the class of bug that's likely once `BookingForm`'s state (M12-S07) and M13's TanStack Query hooks get more complex — the rule catches it at lint time instead of "it works on my machine, breaks after the third click."

**`eslint-plugin-jsx-a11y`** checks accessibility: missing `alt` on images, buttons/links with no accessible text, invalid `aria-*` attributes, click handlers on non-interactive elements (`<div onClick>`  instead of `<button>`). Ikaro hotsites are public-facing pages for small businesses who will never run their own accessibility audit — catching these issues in CI is the only safety net they get.

```js
// apps/web/eslint.config.js
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = [
  ...baseConfig,
  { files: ['**/*.ts', '**/*.tsx'], ...reactHooks.configs.flat.recommended },
  { files: ['**/*.ts', '**/*.tsx'], ...jsxA11y.flatConfigs.recommended },
  { ignores: ['next-env.d.ts'] },
];
```

Both are added **only** to `apps/web/eslint.config.js`, not the shared `packages/config/eslint-base.js` — the backend and BFF have no JSX and no hooks, so these rules would be pure noise (and false positives) there. This is the same "scope the config to where it's relevant" instinct as `sonar.coverage.exclusions` differing between `apps/web` and the backend.

Per CLAUDE.md's "no `// eslint-disable`" rule, any violation these plugins surfaced in existing code (missing `alt` text, a `useEffect` with an incomplete dependency array) was **fixed**, not suppressed.

---

---

<a name="m13-s41"></a>
## M13-S41 — Playwright E2E: What Integration Tests Can't Catch

---

### 50. What Playwright Is (and Why Unit Tests Aren't Enough)

Unit tests and component tests (Vitest) test **individual functions and components in isolation**. Playwright tests test **the whole application running for real** — a real Next.js server, real BFF, real database, a real (headless) browser.

Here's what only an E2E test can catch:

| Scenario | Unit test? | E2E test? |
|---|---|---|
| A button click triggers an API call with the right body | ✅ (mock the API) | ✅ (real API) |
| The booking form actually submits to the backend and the record is created | ❌ (backend isn't running) | ✅ |
| A Next.js middleware blocks unauthenticated access | ❌ (no real server) | ✅ |
| The page title from `generateMetadata` appears in `<head>` | ❌ (server component not runnable in Vitest) | ✅ |
| CSS is applied and the button is actually visible (not hidden by a z-index bug) | ❌ | ✅ |

**Backend analogy:** Playwright is your integration/E2E test suite. Vitest unit tests are like testing a use case with an InMemory repository — correct behavior in isolation. Playwright is like running `pnpm test:integration` against a real database — verifies the whole system, not just the parts.

---

### 51. Playwright Anatomy — `test`, `expect`, `page`

A Playwright test looks like this:

```ts
import { test, expect } from '@playwright/test';

test('guest can submit a booking', async ({ page }) => {
  await page.goto('/lavacar-beloauto');
  await page.getByRole('link', { name: 'Agendar' }).click();
  await page.getByTestId('service-card-lavagem-completa').click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByTestId('booking-confirmation')).toBeVisible();
});
```

**`test(description, async ({ page }) => {})`** — the test function. It receives a `page` object, which represents a browser tab. Everything you do to interact with or assert on the page goes through `page`.

**`page.goto(url)`** — navigates the browser to that URL. Next.js serves the page for real.

**`page.getByRole()`** / **`page.getByTestId()`** / **`page.locator()`** — ways to find elements in the DOM. More on these below.

**`expect(locator).toBeVisible()`** — assertions. Playwright's `expect()` automatically **waits** (up to a configurable timeout) for the condition to become true. You never write `await page.waitFor(500)` (a bad pattern) — you just assert and Playwright retries until it passes or times out.

---

### 52. How to Find Elements — Locators

Playwright uses **locators** instead of raw CSS selectors. A locator is a description of an element — Playwright resolves it lazily when you use it, and retries if the element isn't found yet.

**The hierarchy of locator types (best to worst):**

1. **`getByRole(role, { name })`** — finds by ARIA role + accessible name. Most robust. Tests what users actually see.
   ```ts
   page.getByRole('button', { name: 'Próximo' })
   page.getByRole('heading', { name: 'Bem-vindo à Lavacar BH' })
   page.getByRole('link', { name: 'Agendar agora' })
   ```

2. **`getByTestId('some-id')`** — finds by `data-testid` attribute. Use when no semantic role fits.
   ```ts
   page.getByTestId('service-card-lavagem-completa')
   // matches: <div data-testid="service-card-lavagem-completa">
   ```

3. **`getByText('exact text')`** — finds by visible text content. Fragile under i18n and copy changes. Use sparingly.

4. **`locator('css-selector')`** — raw CSS. Last resort. Breaks easily when HTML changes.

**Why we banned `getByLabel` and `getByText` in E2E tests (see CLAUDE.md §9 CI notes):** These match on user-facing text strings. If the pt-BR copy changes (`"Próximo"` → `"Continuar"`), every test that matches that string breaks — even if the feature still works. `getByRole` with a `name` is better but still brittle. `data-testid` is completely decoupled from copy and CSS — the test breaks only when the feature is removed, not when copy is tweaked.

---

### 53. `data-testid` — The Contract Between Playwright and Your Components

A `data-testid` attribute is a stable identifier you add to elements specifically for testing. It carries no semantic meaning to the browser, no styling, no behavior — it exists purely so Playwright can find the element.

```tsx
// In the component
<div data-testid="booking-form-step-1">
  <h2>Escolha os serviços</h2>
  {services.map(s => (
    <button
      key={s.id}
      data-testid={`service-card-${s.slug}`}   // dynamic — encodes data in the id
      onClick={() => toggle(s.id)}
    >
      {s.name}
    </button>
  ))}
</div>
```

```ts
// In the test
await page.getByTestId(`service-card-lavagem-completa`).click();
```

**Rule: never embed dynamic values like dates in `data-testid`:**

```tsx
// ✗ WRONG — date changes every day, test breaks tomorrow
<button data-testid={`slot-${slot.date}-${slot.time}`}>

// ✓ CORRECT — encode data in separate attributes, keep id stable
<button data-testid="slot-card" data-date={slot.date} data-time={slot.time}>
```

Then in Playwright:
```ts
await page.locator('[data-testid="slot-card"][data-date="2026-06-20"]').click();
```

The `data-testid` is stable (`"slot-card"`); the variable data is in a separate `data-date` attribute that you can match with CSS attribute selectors.

---

### 54. `playwright.config.ts` — The Test Runner Setup

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:3000',    // all page.goto('/foo') resolve to http://localhost:3000/foo
  use: {
    trace: 'on-first-retry',           // record a trace when a test fails once, for debugging
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',               // starts Next.js before running tests
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],   // in CI: always start fresh; locally: reuse if running
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
```

The `webServer` block is key — Playwright starts `pnpm dev` before running any test, waits until `localhost:3000` responds, then runs all tests, then shuts down the server. **You don't have to manually start the dev server before running Playwright.**

**`reuseExistingServer: !process.env['CI']`:** Locally you often already have `pnpm dev` running. This flag tells Playwright to reuse it instead of starting another. In CI, there's no existing server so it always starts fresh.

---

### 55. `test.step()` — Named Steps Inside a Test

For long E2E tests with multiple actions, `test.step()` wraps logical sections so the Playwright report shows them as named phases:

```ts
test('guest completes a booking end-to-end', async ({ page }) => {
  await test.step('navigate to hotsite', async () => {
    await page.goto('/lavacar-beloauto');
  });

  await test.step('select a service', async () => {
    await page.getByTestId('service-card-lavagem-completa').click();
    await page.getByRole('button', { name: 'Próximo' }).click();
  });

  await test.step('pick a slot', async () => {
    await page.getByTestId('slot-card').first().click();
    await page.getByRole('button', { name: 'Próximo' }).click();
  });
});
```

When the test fails, the Playwright report shows exactly which step failed — not just "test failed at line 47." Same value as a structured `correlationId` in logs: you know where in the flow things went wrong without reading every line.

---

### 56. `page.waitForResponse()` — Waiting for Network

Sometimes you need to wait for an API call to complete before asserting:

```ts
// Wait for the booking POST to complete before checking the confirmation
const [response] = await Promise.all([
  page.waitForResponse(res => res.url().includes('/v1/bookings') && res.request().method() === 'POST'),
  page.getByRole('button', { name: 'Confirmar agendamento' }).click(),
]);

expect(response.status()).toBe(201);
await expect(page.getByTestId('booking-success-banner')).toBeVisible();
```

`Promise.all` here is important — you start the wait and the click at the same moment. If you clicked first and then waited, the response might arrive (and be gone from Playwright's buffer) before you started listening.

**Backend analogy:** This is like using `await` on a published event in an integration test — you don't just fire the command and immediately assert the read model, you wait for the event handler to finish first. Same principle, different mechanism.

---

---

<a name="m13-s01"></a>
## M13-S01 — TanStack Query + Typed BFF Client

---

### 57. The Problem TanStack Query Solves

Before TanStack Query, making an API call from a React component looked like this:

```tsx
'use client';
function BookingList() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/v1/bookings')
      .then(r => r.json())
      .then(data => { setBookings(data); setLoading(false); })
      .catch(err => { setError(err); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState />;
  return <List items={bookings} />;
}
```

This has serious problems:
1. **No caching** — every time the component mounts, it fetches again. Navigate away and back → another fetch.
2. **Race conditions** — two requests can overlap. The second might resolve before the first, setting stale data.
3. **No background refresh** — stale data is shown indefinitely.
4. **Lots of boilerplate** — 3 state variables + a `useEffect` for every single data-fetch.
5. **No cross-component sharing** — two components showing the same data make two separate requests.

TanStack Query (`@tanstack/react-query`) solves all of these. You describe *what* you want (a query key + an async function that fetches it). The library handles *how* (caching, deduplication, background refresh, loading/error states).

---

### 58. React Hooks — What They Are

Before going further into TanStack Query, you need to understand hooks — since TanStack Query is built entirely around them.

**A hook is a function whose name starts with `use` and that can only be called inside a React component (or another hook).** Hooks let components opt into React features like state, side effects, and context.

The core built-in hooks:

**`useState`** — adds state to a component. The component re-renders every time the state changes.

```tsx
const [count, setCount] = useState(0);
// count = current value
// setCount = function to update it (triggers a re-render)

<button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
```

**`useEffect`** — runs a side effect (API call, event listener, timer) after the component renders.

```tsx
useEffect(() => {
  // runs after every render where [dependency] changed
  document.title = `Bookings (${count})`;
}, [count]);  // dependency array — effect re-runs when these values change

useEffect(() => {
  // runs once on mount (empty array = no dependencies = never re-runs)
  startWebSocket();
  return () => stopWebSocket();  // cleanup runs on unmount
}, []);
```

**`useRef`** — holds a mutable value that does NOT trigger a re-render when changed. Also used to access DOM elements.

```tsx
const inputRef = useRef<HTMLInputElement>(null);
// inputRef.current = the actual <input> DOM node
<input ref={inputRef} />
<button onClick={() => inputRef.current?.focus()}>Focus</button>
```

**`useMemo`** — caches an expensive computed value, only recalculates when dependencies change.

```tsx
const total = useMemo(
  () => items.reduce((sum, item) => sum + item.price, 0),
  [items]  // only recalculate when items changes
);
```

**`useCallback`** — caches a function reference (same idea as `useMemo` but for functions). Important when passing callbacks to child components — without it, a new function is created on every render, causing unnecessary child re-renders.

```tsx
const handleSubmit = useCallback(() => {
  submitBooking(selectedServices);
}, [selectedServices]);  // new function only when selectedServices changes
```

**The Rules of Hooks (enforced by `eslint-plugin-react-hooks`):**
1. Only call hooks at the top level — never inside `if`, loops, or nested functions
2. Only call hooks from React components or custom hooks

**Why these rules?** React relies on hooks being called in the **same order** on every render to correctly match state to the right hook. An `if` statement could cause a hook to be skipped on some renders, breaking that order and corrupting state.

---

### 59. `useQuery` — The Core TanStack Query Hook

```tsx
import { useQuery } from '@tanstack/react-query';
import { fetchStaffBookings } from '@/lib/api/dashboard/bookings';

function BookingQueue() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bookings', 'pending', tenantId],
    queryFn: () => fetchStaffBookings({ status: 'PENDING' }),
    staleTime: 30_000,   // consider data fresh for 30s — no refetch during this window
  });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBanner />;
  return <BookingList bookings={data.items} />;
}
```

**`queryKey`** — an array that uniquely identifies this query. Think of it as the cache key. If two components use the same `queryKey`, they share the same cached data — only one fetch happens, both get the result.

```ts
['bookings', 'pending', tenantId]   // tenant A's pending bookings
['bookings', 'approved', tenantId]  // same shape, different status — separate cache entry
['bookings', 'pending', tenantIdB]  // different tenant — completely separate cache entry
```

**Why `tenantId` in the key:** If a staff member switches accounts (somehow), the old tenant's bookings must not be served from cache to a new tenant's context. Including `tenantId` ensures cache entries are scoped — a `tenantId` change produces a different key → a fresh fetch.

**`queryFn`** — the async function that actually fetches the data. Must return a Promise.

**`staleTime`** — how long (in ms) before cached data is considered "stale." While data is fresh (within `staleTime`): navigate away and back → no refetch, instant load from cache. After `staleTime` expires: next access triggers a background refetch while showing stale data immediately ("stale-while-revalidate" pattern).

**Backend analogy:** `useQuery` is like a request-scoped + TTL-based cache for API responses. `queryKey` is the cache key. `staleTime` is the TTL. The difference: it's browser-side, it's per-tab, and it automatically hooks into the component lifecycle.

---

### 60. `useMutation` — Writing Data

`useQuery` is for reading. `useMutation` is for writing (POST, PATCH, DELETE):

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function ApproveButton({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (id: string) => approveBooking(id),
    onSuccess: () => {
      // Invalidate the bookings cache — next render will refetch
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err) => {
      toast.error('Erro ao aprovar agendamento');
    },
  });

  return (
    <button onClick={() => mutate(bookingId)} disabled={isPending}>
      {isPending ? 'Aprovando...' : 'Aprovar'}
    </button>
  );
}
```

**`mutate(variables)`** — triggers the mutation. `variables` is passed to `mutationFn`.

**`isPending`** — true while the mutation is in-flight. Use it to disable buttons and show loading spinners.

**`onSuccess` → `invalidateQueries`** — after a mutation succeeds, the cache is likely stale. `invalidateQueries` marks matching cache entries as stale so the next render triggers a fresh fetch. You don't need to manually update the list — just invalidate and let `useQuery` refetch.

**`mutate` vs `mutateAsync`:**
- `mutate()` — fire-and-forget. Errors are caught by `onError`, not by you.
- `mutateAsync()` — returns a Promise. You `await` it and catch errors yourself. Use when you need to do something after the mutation in the same async flow.

---

### 61. `QueryClient` and `QueryClientProvider` — The Global Store

TanStack Query stores all its cache in a `QueryClient` instance. This instance must be shared across the whole app — that's how two different components on the same page share the same cache for the same query key.

```tsx
// app/dashboard/layout.tsx  (the dashboard shell — a 'use client' component)
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function DashboardLayout({ children }) {
  // useState ensures the QueryClient is created once per component mount,
  // not recreated on every render
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,   // 30s fresh window for all queries by default
        retry: 1,            // retry once on failure before going to error state
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**Why `useState(() => new QueryClient())`** — the function form of `useState` (a "lazy initializer") ensures `new QueryClient()` is called only once, when the component first mounts, not on every re-render. If you wrote `useState(new QueryClient())`, React would construct a new `QueryClient` on every re-render (even though it throws them away) — wasteful.

**Backend analogy:** `QueryClient` is like your Redis instance. `QueryClientProvider` is like injecting that Redis connection into your dependency injection container so any service can reach it. Every `useQuery` call is like a service calling `redis.get(key)`.

---

### 62. When to Use TanStack Query vs Plain `fetch` vs Axios

This codebase uses three different approaches to data fetching, in different layers:

| Layer | Tool | Why |
|---|---|---|
| Hotsite pages (`app/[slug]/`) | `fetch()` with `next: { revalidate }` | Server components — TanStack Query doesn't work server-side. ISR caching is the right model here. |
| Dashboard pages (`app/dashboard/`) | TanStack Query + axios | Client components with complex async state — loading/error/stale states, cross-component cache sharing, mutations with optimistic updates |
| BFF client (`lib/api/bff-client.ts`) | axios | Interceptors for 401/403 handling, typed responses, cleaner API than raw `fetch` |

**Why axios over `fetch` in the dashboard:**

`fetch()` is built into the browser — no library needed. For simple cases it's fine. But for a dashboard with many API calls, axios provides:

1. **Interceptors** — middleware for every request/response. In Ikaro, a response interceptor catches every `401` (expired JWT) and redirects to login, without duplicating that logic in every hook.

```ts
// lib/api/bff-client.ts
export const bffClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BFF_URL,
  withCredentials: true,   // sends cookies (access_token httpOnly cookie) automatically
});

bffClient.interceptors.response.use(
  (response) => response,   // pass successful responses through unchanged
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/dashboard/login';
      return Promise.reject(new AuthError());
    }
    if (error.response?.status === 403) {
      return Promise.reject(new ForbiddenError());
    }
    return Promise.reject(error);
  },
);
```

2. **`withCredentials: true`** — tells axios to include cookies in cross-origin requests. Without this, the `access_token` httpOnly cookie would not be sent to the BFF.

3. **Typed responses** — `axios.get<BookingListResponse>(url)` returns a typed `AxiosResponse<BookingListResponse>`, so `res.data` is correctly typed without casting.

**The decision rule:**
- Server component that runs at request time or at build time → `fetch()` with `next:` options
- Client component that needs loading/error/stale state, or data that multiple components share → TanStack Query + axios
- One-off client-side POST (like a form submit) where you don't need the response cached → `useMutation` + axios

---

### 63. The `dist/` Problem — How TypeScript Packages Work in a Monorepo

During the CI problems with the observability package, you saw an error like:

```
Cannot find module '@ikaro/observability' or its corresponding type declarations
```

This is a fundamental Node.js/TypeScript monorepo concept worth understanding.

**The problem:** When you write a TypeScript package (`packages/observability/`), you write `.ts` files. But when another package (`apps/backend/`) imports `@ikaro/observability`, Node.js is running JavaScript — it can't read `.ts` files. It needs the compiled `.js` output.

**The solution:** TypeScript packages in a monorepo must be **compiled** before other packages can import them. The compilation produces a `dist/` folder:

```
packages/observability/
├── src/
│   ├── app-logger.ts        ← you write this
│   └── index.ts
└── dist/                    ← tsc generates this (gitignored)
    ├── app-logger.js
    ├── app-logger.d.ts      ← type declarations (so TypeScript still works in importers)
    └── index.js
```

`packages/observability/package.json` points to the compiled output:
```json
{
  "main": "./dist/index.js",       // Node.js runtime uses this
  "types": "./dist/index.d.ts"     // TypeScript compiler uses this for type-checking
}
```

**The CI fix:** The root `package.json` has a `postinstall` script:

```json
{
  "scripts": {
    "postinstall": "pnpm --filter @ikaro/observability build && pnpm --filter @ikaro/env-validation build"
  }
}
```

`postinstall` runs automatically after `pnpm install`. This ensures the `dist/` folders always exist before any app tries to import from these packages.

**Why these two packages and not others?** `@ikaro/types` is TypeScript-only type declarations — no runtime code. Packages that import it only need the `.ts` source files, handled by TypeScript's `paths` mapping. `@ikaro/observability` and `@ikaro/env-validation` have **runtime code** (actual JS that runs), so they need compilation.

**Backend analogy:** It's like compiling a Java library (`.jar`) before your application can import its classes. The library's source (`.java`) is what you edit; the `.jar` is what the runtime loads. The build step bridges the two.

---

### 64. Custom Hooks — Reusing Stateful Logic

A **custom hook** is just a function that uses other hooks. Naming it `use*` makes it a hook and lets you use hooks inside it.

Without custom hooks, you'd repeat TanStack Query boilerplate in every component:

```tsx
// ✗ Without custom hook — repeated in every component that shows bookings
const { data, isLoading, isError } = useQuery({
  queryKey: ['bookings', 'pending', tenantId],
  queryFn: () => fetchStaffBookings({ status: 'PENDING' }),
  staleTime: 30_000,
});
```

With a custom hook:

```ts
// lib/hooks/use-staff-bookings.ts
export function useStaffBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', filters, tenantId],
    queryFn: () => fetchStaffBookings(filters),
    staleTime: 30_000,
  });
}

// In the component — clean and reusable
const { data, isLoading } = useStaffBookings({ status: 'PENDING' });
```

**The rule:** if you use the same combination of hooks in more than one component, extract it into a custom hook. Keep hooks focused on one concern.

**Custom hooks can be tested with Vitest** using `@testing-library/react`'s `renderHook`:

```ts
import { renderHook, waitFor } from '@testing-library/react';

it('returns bookings for the current tenant', async () => {
  const { result } = renderHook(() => useStaffBookings({ status: 'PENDING' }), {
    wrapper: QueryClientProvider,
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.items).toHaveLength(2);
});
```

---

---

<a name="m13-s02"></a>
## M13-S02 — HTTP Cookies, Auth Security, and BFF Patterns

---

### 65. Why `localStorage` is Unsafe for JWTs

The first instinct for storing a JWT in a browser is `localStorage`:

```ts
// ✗ Unsafe pattern — never do this with auth tokens
localStorage.setItem('access_token', jwt);
// later:
const token = localStorage.getItem('access_token');
fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
```

**The problem: XSS (Cross-Site Scripting).** If any script on your page can run `localStorage.getItem('access_token')`, so can a malicious script injected via an XSS vulnerability (a compromised npm package, a reflected XSS in a query param, etc.). The script sends the token to an attacker's server. The attacker now has a valid JWT and can impersonate the user until it expires.

`localStorage` is accessible to **any JavaScript running on the page** — including scripts you didn't write.

---

### 66. httpOnly Cookies — The Safer Alternative

An `httpOnly` cookie is set by the server and stored by the browser, but **JavaScript cannot read it**. The browser attaches it automatically to every request to the same domain.

```ts
// BFF sets the cookie on login
res.cookie('access_token', jwtToken, {
  httpOnly: true,    // ← JavaScript cannot read this. Ever.
  secure: true,      // ← only sent over HTTPS (not plain HTTP)
  sameSite: 'lax',  // ← only sent on same-site requests (protects against CSRF)
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
  path: '/',
});
```

From that point on:
- Browser stores the cookie
- Every request to the BFF automatically includes `Cookie: access_token=<jwt>` in the headers — **no JavaScript code does this**
- An XSS attack can run `document.cookie` — but `httpOnly` cookies are **invisible** to `document.cookie`. The attacker gets nothing.

The `Set-Cookie` response header is what tells the browser to store it:
```
Set-Cookie: access_token=eyJhbGci...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

**The tradeoff:** You can't read the cookie value from JavaScript (to decode the JWT and get the user's name/role for the UI). You have to either:
- Call a `/auth/me` endpoint that returns the decoded user info, or
- Store non-sensitive display info (name, role) in a separate, non-httpOnly cookie or in-memory state

---

### 67. `@Res({ passthrough: true })` — Why NestJS Needs This

When a NestJS controller method needs to set a cookie, it needs access to the Express `Response` object (`res`). Normally, NestJS handles the response automatically — it takes your method's return value and sends it as JSON. But if you inject `@Res()`, NestJS thinks *you* are taking over the response, and stops doing that automatically.

That breaks `return { tenantSlug, expiresIn }` — NestJS no longer serializes it.

`passthrough: true` tells NestJS: "I want `res` to set the cookie, but you still handle sending the return value."

```ts
// ✗ Without passthrough — NestJS hands over full response control
async issueToken(
  @Body() dto: IssueTokenDto,
  @Res() res: Response,   // NestJS: "ok you're sending the response"
): Promise<{ tenantSlug: string }> {
  res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
  return { tenantSlug: 'lavacar-bh' };  // ← this is NEVER SENT. NestJS does nothing.
}

// ✓ With passthrough — NestJS sends the return value, you only set the cookie
async issueToken(
  @Body() dto: IssueTokenDto,
  @Res({ passthrough: true }) res: Response,   // NestJS: "ok I'll still send the response"
): Promise<{ tenantSlug: string }> {
  res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
  return { tenantSlug: 'lavacar-bh' };  // ← this IS sent as JSON body
}
```

**Pattern in Ikaro:** `devLogin()` was the reference implementation — it already used `@Res({ passthrough: true })`. Whenever you need to set a cookie OR a custom response header while still returning a typed response body, this is the pattern.

---

### 68. `SameSite` — CSRF Protection Built Into the Cookie

**CSRF (Cross-Site Request Forgery):** A malicious website tricks your browser into making a request to your BFF (since the browser has the auth cookie and attaches it automatically).

```
User is logged into lavacar.ikaro.com
User visits evil.com
evil.com has: <img src="https://bff.ikaro.com/v1/bookings/123/cancel">
Browser makes that request, automatically attaching the access_token cookie
BFF receives authenticated request from the user — and cancels the booking
```

`SameSite=Lax` prevents this. The cookie is only sent when the navigation originates from your own site. A request triggered by a page on `evil.com` does not include the cookie.

| `SameSite` value | Behavior |
|---|---|
| `Strict` | Cookie only sent when URL bar shows your domain. Breaks OAuth redirects (Google redirects back to your site — `Strict` considers this cross-site and drops the cookie). |
| `Lax` | Cookie sent on top-level navigations (clicking a link, form submit). Not sent on sub-resource requests (images, iframes) from other sites. **Ikaro uses this** — it permits OAuth redirects while blocking the CSRF scenario above. |
| `None` | Always send. Must be paired with `Secure: true`. Needed for embedded iframes on other domains. |

---

### 69. Why the BFF Returns `{ tenantSlug }` Instead of the Token

After setting the cookie in `POST /auth/token`, the BFF returns:

```json
{ "tenantSlug": "lavacar-bh", "expiresIn": "7d" }
```

Not the JWT. The frontend doesn't need the JWT — the browser has it in the cookie. What the frontend *does* need is: **where should I send the user now?**

The `tenantSlug` is the redirect destination. The login page (`/select-tenant`) receives this and navigates to `/{tenantSlug}`:

```ts
const { tenantSlug } = await issueToken({ selectionToken, tenantId });
router.push(`/${tenantSlug}`);   // → /lavacar-bh
```

**The general pattern:** when a mutation changes auth state, the server's JSON response should tell the client *what to do next*, not expose internal state (the token). The token is a server-side concern that lives in the cookie layer.

---

### 70. The `withCredentials: true` Requirement for Cross-Origin Cookies

Browsers block cookies on cross-origin requests by default. In development:
- Next.js frontend: `localhost:3000`
- BFF: `localhost:3002`

These are different origins (different port = different origin). Without configuration, `axios.post('http://localhost:3002/v1/auth/token')` would NOT send the `access_token` cookie and would NOT save a `Set-Cookie` from the response.

```ts
// lib/api/bff-client.ts
export const bffClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BFF_URL,
  withCredentials: true,   // ← required for cross-origin cookies to work
});
```

`withCredentials: true` tells axios (and the underlying `XMLHttpRequest`/`fetch`) to include credentials (cookies, HTTP auth) on cross-origin requests. The BFF must also respond with `Access-Control-Allow-Credentials: true` in CORS headers — which NestJS's CORS config in `main.ts` sets.

In production, the frontend and BFF share the same domain (via a path prefix or a single domain with different service routing), so this is less of an issue — but the config is still correct to have.

---
