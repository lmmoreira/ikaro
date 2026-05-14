# M00 — Developer Guide (for Leonardo)

**Audience:** You — a specialist in other areas, learning Node/TypeScript concepts through this project.  
**Style:** Concepts explained with rationale. Code examples from our actual codebase.  
**AI agents:** Ignore this file — it has no implementation instructions.

---

## 1. The Monorepo — Why One Repo for Three Apps?

A **monorepo** keeps `backend`, `bff`, and `web` in the same Git repository. The alternative (three separate repos) sounds cleaner but creates a painful problem: when you change an API contract, you have to update three repos, open three PRs, and coordinate three deployments. With a monorepo, a breaking change in the API is a TypeScript compile error across all three — you cannot accidentally ship a mismatch.

**pnpm workspaces** is the mechanism. The root `pnpm-workspace.yaml` tells pnpm "treat every folder under `apps/` and `packages/` as an independent package". Each has its own `package.json` with its own dependencies. But they all install together, and can reference each other using `workspace:*` instead of a version number.

```
root/
  apps/
    backend/   ← @beloauto/backend
    bff/       ← @beloauto/bff
    web/       ← @beloauto/web
  packages/
    types/     ← @beloauto/types    (shared DTOs)
    config/    ← @beloauto/config   (shared lint/ts/prettier)
```

When `apps/bff/package.json` says `"@beloauto/types": "workspace:*"`, pnpm creates a symlink — importing from `@beloauto/types` in BFF code resolves directly to `packages/types/src/index.ts`. No build step needed during development.

---

## 2. TypeScript — What "Strict Mode" Actually Means

You'll see `"strict": true` in `packages/config/tsconfig.base.json`. This is not one setting — it's a shorthand that enables about 8 strict checks simultaneously. The most important ones:

- **`noImplicitAny`** — if TypeScript can't infer the type of a variable, you must declare it explicitly. This prevents the classic JavaScript "I thought this was a string but it was undefined" bugs.
- **`strictNullChecks`** — `null` and `undefined` are NOT valid values for a `string`. You must explicitly handle them. Example: `user?.name ?? 'Unknown'`.
- **`strictPropertyInitialization`** — every class property declared must be initialized. This prevents `this.service` being undefined at runtime when you forget to assign it.

The project also adds `"noUnusedLocals": true` and `"noUnusedParameters": true` — TypeScript will error if you import something you don't use. This keeps code clean.

**Why `module: CommonJS` for backend/BFF despite the base using `NodeNext`?**

`NodeNext` is the modern TypeScript setting that aligns with Node.js ES modules. But NestJS is built on CommonJS (the older system, using `require()` instead of `import`). Mixing them causes mysterious runtime errors. So the backend and BFF tsconfig files override the base: `"module": "CommonJS"`. The Next.js frontend uses `bundler` (Webpack/Turbopack handles the modules).

---

## 3. ESLint — The Code Quality Guard

ESLint is a **linter**: a program that reads your code and reports problems before you even run it. Think of it as a very opinionated code reviewer that runs automatically.

**Flat config (ESLint 10):** ESLint recently changed its configuration format. Old format was `.eslintrc.js` (JSON-like). New format is `eslint.config.js` that exports a JavaScript array. Our `packages/config/eslint-base.js` uses this new format. Each item in the array is a "rule set" applied to matching files.

**Key rules we enforce:**
- `@typescript-eslint/no-explicit-any: error` — you cannot write `any` as a type. `any` defeats TypeScript entirely — it's an escape hatch that hides bugs.
- `no-console: error` — you cannot use `console.log`. Instead, use `AppLogger` which outputs structured JSON. Why? In production, `console.log` is unstructured text that's hard to search. Structured JSON logs can be queried ("show me all errors for tenant X in the last hour").
- `prettier/prettier: error` — code must be formatted exactly as Prettier would format it. This eliminates all formatting debates.

---

## 4. NestJS — The Backend Framework

NestJS is an opinionated Node.js framework that brings the same "module" pattern you'd recognize from Angular or Spring (Java). It uses **decorators** (those `@` symbols) heavily.

### The Module System
Everything in NestJS is organized into `Module`s. A module is a class decorated with `@Module()` that declares:
- `controllers` — classes that handle HTTP requests
- `providers` — services, repositories, and other injectable classes
- `imports` — other modules whose providers you want to use

```typescript
@Module({
  controllers: [HealthController],  // handles GET /health/live
  providers: [MyService],           // injectable service
})
export class AppModule {}
```

### Dependency Injection (DI)
NestJS manages object creation for you. Instead of `new MyRepository()` inside a service (which you can't mock in tests), you declare the dependency in the constructor:

```typescript
@Injectable()
export class BookingService {
  constructor(
    @Inject(BOOKING_REPO) private readonly repo: IBookingRepository,
  ) {}
}
```

NestJS reads the constructor, creates an instance of `IBookingRepository`, and passes it in. In tests, you can swap it for a fake. This is **Inversion of Control** — you don't control when your dependencies are created; the framework does.

### Interceptors
An **interceptor** wraps every request-response cycle. Our `CorrelationInterceptor` runs before and after every HTTP request:

```typescript
intercept(context, next): Observable<unknown> {
  // runs BEFORE the controller
  const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
  res.setHeader('X-Correlation-ID', correlationId);
  
  return next.handle(); // calls the actual controller
  // code after next.handle() would run AFTER the controller
}
```

Every response now carries `X-Correlation-ID`. When a bug report comes in, the developer can search all logs for that ID and see the complete trace of that request.

---

## 5. Hexagonal Architecture — Why the Domain/ Application/ Infrastructure Folders

You'll see this pattern in every context:

```
contexts/booking/
  domain/           ← pure business logic, no frameworks
  application/      ← use cases that orchestrate the domain
  infrastructure/   ← TypeORM, HTTP controllers, event publishers
```

**The rule:** dependencies only point inward. `infrastructure` can import from `application` and `domain`. `application` can import from `domain`. `domain` imports nothing from the project (only pure TypeScript/Node).

**Why this matters:** if you ever need to change from TypeORM to Prisma, or from REST to GraphQL, you only change `infrastructure`. The domain logic and use cases are untouched. You can also test the domain logic with pure JavaScript — no database, no HTTP server, no NestJS — just `new Booking()` and assertions.

---

## 6. Domain-Driven Design (DDD) Concepts

### ValueObject
A value object has no identity — it's defined entirely by its properties. Two `Money` objects with the same amount are equal. There's no "Money #1234". That's why `ValueObject.equals()` compares `props` structurally, not by reference.

Value objects are also **immutable**. `Object.freeze(props)` in the base class means you can't accidentally mutate a price after creating it. `Money.add()` returns a **new** `Money` instance, never modifying the original.

### AggregateRoot
An aggregate is a cluster of related domain objects treated as a unit. A `Booking` is an aggregate: it has `BookingLine`s, but you never save a `BookingLine` independently — always through the `Booking`. The `AggregateRoot` base class adds an event list:

```typescript
// Inside Booking domain entity
approve(correlationId: string): void {
  this.status = 'APPROVED';
  this.addDomainEvent(new BookingApproved(this.tenantId, correlationId, this.id));
}
```

After calling `booking.approve()`, the booking holds the event in memory. The repository then publishes it to Pub/Sub when saving. This pattern **decouples** approval logic from notification logic — the booking doesn't know a notification will be sent. It just says "this thing happened".

### DomainEvent
Every domain event has 7 required fields (see `CLAUDE.md §4`). We use **UUID v7** for `eventId`. UUID v7 is time-ordered — events from the same second will sort lexicographically, which helps when debugging event sequences. We implemented it natively to avoid a dependency issue with `uuid@14` (ESM-only, incompatible with our Jest/CJS setup).

---

## 7. Money — Why Not Just `number`?

```typescript
0.1 + 0.2 === 0.30000000000000004  // JavaScript floating point!
```

Floating point numbers cannot represent all decimal fractions exactly. For money, this is unacceptable. If a service costs R$ 99.99 and you multiply by 100 customers, you might get R$ 9999.000000000002.

We use **`decimal.js`** which uses arbitrary-precision arithmetic. `new Decimal('0.1').plus('0.2').equals('0.3')` is `true`.

The `Money` value object stores the amount as a **string** internally (`"99.99"`) to survive JSON serialization without precision loss. The `format()` method converts it to `"R$ 99,99"` — note the Brazilian format: comma for decimal, dot for thousands.

---

## 8. TypeORM and Migrations — Why Never `synchronize: true`

TypeORM has a `synchronize: true` option that automatically alters the database schema to match your entity definitions when the app starts. This sounds convenient. It is also extremely dangerous in production: if you rename a column, TypeORM will drop the old column and create a new one, losing all data.

Instead, we use **migrations** — explicit SQL files that describe each schema change. They run in order, are tracked in a `migrations` table, and can be reversed. The pattern "expand then contract" (add new column → backfill → remove old column across multiple deploys) is the safe way to change schema on a live database.

`synchronize: false` is enforced — see CLAUDE.md §8 anti-patterns.

---

## 9. The BFF Pattern (Backend-for-Frontend)

The **BFF** is a thin service that sits between the browser and the backend. It handles:
1. **Authentication** — OAuth flow, JWT cookies. The browser never talks to the backend directly.
2. **Aggregation** — a dashboard page might need data from `booking`, `loyalty`, and `staff` contexts. The BFF combines these into one response, so the browser makes one request instead of three.
3. **Tenant enforcement** — every request carries a tenant slug in the cookie/header. The BFF validates it and rejects mismatches.

Without a BFF, the frontend would need to know about all backend services, handle auth tokens manually, and make multiple requests for a single page. The BFF is the only "smart" entry point for the web layer.

---

## 10. JWT Cookies — Why httpOnly?

A **JWT (JSON Web Token)** is a signed token that proves "user X belongs to tenant Y with role Z". We store it in a cookie with `httpOnly: true`.

`httpOnly` means JavaScript running in the browser **cannot read** this cookie — not even our own code. This blocks XSS attacks: if someone injects malicious JavaScript into the page, they still can't steal the session token because it's invisible to JavaScript.

We use `sameSite: 'lax'` instead of `'strict'` because `'strict'` would block the cookie from being sent during the OAuth redirect (a cross-site navigation). `'lax'` allows it for top-level navigations while still blocking most CSRF attack patterns.

---

## 11. Zod — Runtime Type Safety for Environment Variables

TypeScript types are erased at runtime. When your app reads `process.env.DATABASE_URL`, TypeScript types it as `string | undefined` — it has no idea what the actual value is until the program runs.

**Zod** validates JavaScript values against a schema at runtime:

```typescript
const schema = z.object({
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
  PORT: z.coerce.number().default(3002),  // converts "3002" string → 3002 number
});

const result = schema.safeParse(process.env);
if (!result.success) process.exit(1);  // die loudly, not silently
```

Without this, a misconfigured production deployment would start silently and fail mysteriously when the first request tried to sign a JWT. With Zod validation at startup, it fails immediately with a clear error message listing every missing variable.

---

## 12. Docker Compose — What Each Service Does

```yaml
postgres:        # PostgreSQL database — persists booking, tenant, staff, etc.
pubsub-emulator: # GCP Pub/Sub emulator — replaces cloud messaging locally
gcs-emulator:    # Fake GCS — replaces Google Cloud Storage for photos locally
mailhog:         # Catches all outgoing emails — view them at localhost:8025
```

`docker/init-db.sql` creates 6 PostgreSQL **schemas** (not databases) inside the single `beloauto` database. A schema is like a namespace — `booking.bookings` is a different table from `loyalty.loyalty_entries`, even though they're in the same database. This maps to our bounded contexts and prevents accidental cross-context queries.

---

## 13. Tailwind CSS v4 — What Changed

Classic Tailwind (v2/v3) required a `tailwind.config.js` file listing which files to scan. Tailwind v4 dropped this — it auto-detects files and you configure it via CSS:

```css
/* app/globals.css */
@import "tailwindcss";   /* that's it — no config file needed */
```

The PostCSS plugin changed too: it's now `@tailwindcss/postcss` instead of `tailwindcss`. Our `postcss.config.mjs` reflects this.

---

## 14. shadcn/ui — What It Is and Is Not

`shadcn/ui` is NOT a component library you install like Bootstrap. It's a **code generator** — you run `pnpm dlx shadcn add button` and it copies the source code of a `Button` component into your project. You own the code. You can edit it directly.

This means:
- No "upgrade the library" — components live in `apps/web/components/ui/`
- Full control over styling — edit `button.tsx` to change anything
- The component uses `class-variance-authority` (CVA) for variant management and `tailwind-merge` + `clsx` for className combining

We installed the dependencies manually (the CLI couldn't detect the framework since Next.js had no files yet) but the result is identical.

---

## 15. How pnpm Handles Shared Dependencies

When you run `pnpm lint` from the root, pnpm uses its `-r` (recursive) flag to run the `lint` script in every workspace that has one. Shared tools (`eslint`, `typescript`, `prettier`) are installed in the **root** `devDependencies` so they're available in all packages without duplication.

`shamefully-hoist=false` (in `.npmrc`) is the strict setting that prevents packages from accidentally accessing dependencies they didn't declare. It catches bugs early: if your code imports something and it works only because it happened to be hoisted, it'll break in production.

---

## 16. The Seed Script — Why Fixed UUIDs

The seed script uses constants like:
```typescript
const IDS = {
  tenantA: '00000000-0000-7000-8000-000000000001',
  ...
}
```

Why not generate random UUIDs each time? Because the seed must be **idempotent** — running it twice produces the same result, not double the data. With fixed UUIDs, `INSERT ... ON CONFLICT (id) DO NOTHING` is a safe "insert if not already there" operation. If you used random UUIDs, every run would insert new rows.

These fixed IDs are also useful when writing integration tests — you can reference `SEED_IDS.tenantA` in test assertions without querying the database first.

---

## Summary of Key Patterns to Internalize

| Pattern | Where you see it | Why |
|---|---|---|
| `ValueObject<T>` | `Money`, `Address` | Immutability + structural equality for business concepts |
| `AggregateRoot` | `Booking`, `Tenant` (coming) | Collect domain events, save via repository |
| `DomainEvent` | `BookingApproved` (coming) | Decoupled side effects via Pub/Sub |
| Ports & Adapters | `IEventBus` + `NoopEventBusAdapter` | Swap infrastructure without touching domain |
| `Symbol` injection tokens | `EVENT_BUS`, `EMAIL_SENDER` | Type-safe DI, avoids string collisions |
| Zod env validation | `validateEnv()` in `main.ts` | Fail fast with clear errors on misconfiguration |
| Fixed UUIDs in tests/seed | `seed.ts`, future test fixtures | Idempotent operations, predictable assertions |
