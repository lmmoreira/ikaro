# BeloAuto — Frontend Learning Journal

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

**In BeloAuto:**
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

**Why this matters for BeloAuto:** The hotsite manifest doesn't change unless the admin edits it. Caching it for 5 minutes means 99% of visitor requests never hit the BFF at all. When the admin publishes a change, the backend calls our `/api/revalidate` endpoint (M12-S10 already wires this), which clears the cache immediately.

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

**BeloAuto rule:** Use Tailwind for layout and spacing. Use `var(--ba-*)` for anything brandable (colors, fonts, radius, shadows). Never hardcode colors like `bg-orange-500` — that would ignore the tenant's branding.

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
pnpm --filter @beloauto/web test:cov
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
    pnpm --filter @beloauto/backend test:cov
    pnpm --filter @beloauto/bff test:cov
    pnpm --filter @beloauto/web test:cov   # added
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

**The `satisfies z.ZodType<XxxModuleData>` pattern:** Each schema uses TypeScript's `satisfies` operator to ensure the Zod schema is compatible with the TypeScript interface. If you add a field to `HeroModuleData` in `@beloauto/types` and forget to add it to `HeroModuleDataSchema`, TypeScript gives you a compile error at the schema definition — not a runtime crash at the user.

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

*Next update: M12-S07 — Booking form: controlled inputs, multi-step state, form submission, error handling.*
