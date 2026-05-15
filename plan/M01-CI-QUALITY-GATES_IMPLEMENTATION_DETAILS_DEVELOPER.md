# M01 — Developer Guide (for Leonardo)

**Audience:** You — learning the DevOps and security tooling built in M01.  
**Style:** Concepts explained with rationale. Why each tool exists, what it catches, how it fits together.  
**AI agents:** Ignore this file — read the `_IA.md` companion instead.

---

## 1. The Big Picture — Why Automate Code Review?

Without CI gates, a PR merge relies entirely on the human reviewer catching: a hardcoded API key someone forgot to remove, a dependency with a known security vulnerability, code that type-checks in their editor but fails with `tsc --noEmit`, a missing test that drops coverage. Humans miss things — especially under deadline pressure.

CI quality gates automate the boring-but-critical parts. Every PR gets a deterministic checklist run before any human reviews it. The developer cannot merge unless the pipeline passes. The reviewer can focus on architecture and intent, not typos or forgotten secrets.

M01 builds **three workflows** that enforce seven gates on every PR:

```
PR opened / pushed
       │
       ├── pr-quality.yml  ──→ ESLint  │  Prettier  │  TypeScript  │  SonarCloud
       ├── pr-tests.yml    ──→ Unit Tests  │  Integration Tests
       └── pr-security.yml ──→ Gitleaks  │  Snyk  │  Trivy  │  Checkov
```

All three run in parallel. A single failure blocks the merge.

---

## 2. The Three Workflow Files

### `pr-quality.yml` — Code Quality
Runs on every PR against `main`. Four jobs, all independent (run in parallel):

- **ESLint** — reads the code and flags problems: `any` types, `console.log` calls, unused variables, formatting issues that Prettier missed. Zero warnings allowed.
- **Prettier** — checks every file matches the canonical format. If someone's editor didn't auto-format on save, this catches it. Runs `--check` (read-only, no auto-fix).
- **TypeScript** — runs `tsc --noEmit` across all workspaces. This catches type errors that IDEs sometimes miss (e.g., a type that works in isolation but breaks when compiled together with other packages).
- **SonarCloud** — deep static analysis + the differential coverage gate (covered in §6 below).

### `pr-tests.yml` — Test Suite
- **Unit tests** — fast, no containers. Coverage is measured here and uploaded as a GitHub Actions artifact (`apps/backend/coverage/lcov.info`). SonarCloud reads this artifact.
- **Integration tests** — uses Testcontainers to spin up a real PostgreSQL 15 container and a Pub/Sub emulator inside the CI runner. No mocks for persistence.

### `pr-security.yml` — Security Scanning
Four security tools, each catching a different class of vulnerability (explained in §§3–7 below).

---

## 3. Gitleaks — Secret Scanning

**What it does:** Scans the entire git commit history for patterns that look like secrets: API keys, passwords, JWT signing keys, OAuth tokens, AWS credentials. It reads every commit, not just the current file state. Even if you delete the secret in a follow-up commit, Gitleaks will find it in the history.

**Why commit history matters:** Git is permanent. If a secret appears in any commit, an attacker with read access to the repo (or who cloned it before you deleted the secret) already has it. Deleting from the latest commit doesn't help.

**The config file (`.gitleaks.toml`):**
Gitleaks ships with ~150 built-in detection rules. Some patterns in our codebase look like secrets but aren't — the seed script uses fake Google OAuth IDs like `google-sub-admin-a` as test fixtures. The `.gitleaks.toml` allowlist tells Gitleaks "these specific patterns are known-safe, don't alert on them."

```toml
[allowlist]
  regexes = [
    '''google-sub-(admin|worker|customer)-[a-z]''',  # fake test IDs
    '''change-me-to-a-random''',                       # .env.example placeholders
  ]
  paths = [
    '''.env\.example$''',   # example files are safe by definition
    '''pnpm-lock\.yaml$''', # lockfile has package registry URLs that trigger rules
  ]
```

When you add test fixtures with fake credentials, add them to this allowlist rather than suppressing Gitleaks globally. Keep the allowlist tight.

---

## 4. Snyk SCA — Dependency Vulnerability Scanning

**What SCA means:** Software Composition Analysis. Your `package.json` declares dependencies. Each dependency was written by someone else, and sometimes those packages contain security vulnerabilities — bugs that attackers can exploit. The CVE database (Common Vulnerabilities and Exposures) tracks these publicly.

**What Snyk does:** Reads `pnpm-lock.yaml` and cross-references every package version against the CVE database. If `some-package@1.2.3` has a known critical vulnerability (e.g., remote code execution via a crafted input), Snyk will fail the PR.

**Threshold:** `--severity-threshold=high` — only HIGH and CRITICAL CVEs fail the build. LOW and MEDIUM are reported but don't block merge. This is the right balance: you don't want to be blocked by a theoretical low-risk vuln in a dev tool, but you definitely want to block a critical RCE in a production dependency.

**`--all-projects`:** Scans all workspace `package.json` files, not just the root. Backend, BFF, web, and shared packages are all checked.

**The token (`SNYK_TOKEN`):** Stored in GitHub Secrets. Snyk is a SaaS service — the action authenticates with your Snyk account to get access to the CVE database and generate a report URL. You created this account and token during M01-S04.

---

## 5. SonarCloud — Static Analysis and Differential Coverage

### Static Analysis
SonarCloud reads the code (TypeScript in our case) and looks for:
- **Bugs** — code that is likely to fail at runtime: null dereferences, unreachable code, incorrect boolean logic
- **Security Hotspots** — code patterns that aren't necessarily wrong but need human review: SQL query built from user input, logging sensitive data, weak cryptography
- **Code Smells** — code that works but will cause maintenance problems: duplicated code, functions that are too long, overly complex conditions

### Differential Coverage — What It Is and Why We Use It
A "global coverage" gate (e.g., "the repo must maintain ≥80% coverage") punishes new code unfairly. If the repo is at 75% global coverage and you add a perfectly-tested feature, you still fail because you didn't go back and write tests for years of untested legacy code. That's demotivating and wrong.

**Differential coverage** only measures the coverage of the code _you changed in this PR_. If your PR adds 200 lines and 160 of them are covered by tests, you pass (80%). The gate is: "whatever you touch, test it well."

This is configured in `sonar-project.properties`:
```
sonar.newCode.referenceBranch=main
```
SonarCloud computes the diff between your branch and `main`, then measures coverage only on the changed lines.

### Coverage Flow
```
pr-tests.yml: test:cov
   → apps/backend/coverage/lcov.info (LCOV format)
   → uploaded as GitHub Actions artifact

pr-quality.yml: sonarcloud job
   → reads lcov.info (path in sonar-project.properties)
   → computes differential coverage
   → posts Quality Gate result to the PR
```

Both workflows run independently, but SonarCloud waits for no one — if the coverage artifact isn't ready yet, SonarCloud will use whatever data it has (or fail if there's none). In practice, they run fast enough that this isn't an issue.

---

## 6. Trivy — Docker Image Vulnerability Scanning

Once you build a Docker image, it contains:
- A base OS (Alpine Linux in our case)
- OS packages (wget, glibc, etc.)
- Your Node.js runtime
- Your application code and its dependencies

Any of these layers can contain CVEs. Snyk scans your `package.json` dependencies, but it doesn't know what OS packages Alpine brought in. Trivy scans the final built image — everything in all layers.

**The matrix strategy:** All three apps (backend, bff, web) are scanned independently. `fail-fast: false` means if the backend image has a critical CVE, the BFF and web scans still run — you see all problems at once instead of fixing one and then discovering the next.

**`--ignore-unfixed`:** Some CVEs have no available fix yet (the upstream package hasn't released a patched version). Blocking merges on unfixable CVEs is pointless. This flag skips them.

**npm removal trick:** Alpine ships with npm pre-installed. npm itself has CVEs. Since the app doesn't need npm at runtime (it starts with `node dist/main.js` directly), we remove npm from the runner image:
```dockerfile
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
```
This eliminates several Trivy findings for free.

---

## 7. Checkov — Infrastructure-as-Code Security Scanning

Terraform files (coming in M15) describe our cloud infrastructure: databases, storage buckets, network rules, IAM permissions. Terraform misconfigurations are a common source of cloud security incidents:
- An S3/GCS bucket with public read access
- A database without encryption at rest
- A firewall rule that allows all inbound traffic
- An IAM role with wildcard permissions

Checkov reads `.tf` files and checks them against a library of ~1000 security rules before the code is ever deployed.

**Conditional execution:** This job only runs when files under `infrastructure/terraform/` change. There's no point scanning Terraform files if only a TypeScript file was modified. We use `dorny/paths-filter@v3` to detect whether Terraform files changed, then conditionally run Checkov.

**SARIF format:** Results are output in SARIF (Static Analysis Results Interchange Format) and uploaded to the GitHub Security tab. This is the standard format GitHub uses to display security findings in the PR interface — you'll see inline annotations on the offending Terraform lines.

---

## 8. Docker Multi-Stage Builds — Why Two Stages?

A naive Dockerfile:
```dockerfile
FROM node:20
COPY . .
RUN pnpm install
RUN pnpm build
CMD ["node", "dist/main.js"]
```

This image contains everything: dev dependencies, TypeScript source, the compiler itself, test files. It's ~800MB and has a large attack surface (more packages = more potential CVEs).

A multi-stage build uses two `FROM` statements:

**Stage 1 — `builder`:** Installs everything, compiles TypeScript, runs `pnpm deploy --prod` to extract only production dependencies.

**Stage 2 — `runner`:** Starts fresh from the same base. Copies only what `runner` needs: the compiled JS output and the flat production `node_modules`. The TypeScript compiler, devDependencies, source files, and test infrastructure never make it into the final image.

Result: the runner image is ~150MB and has no compile-time tools.

### `pnpm deploy --prod /standalone`
This is the key step. Instead of copying `node_modules` directly (which contains symlinks to workspace packages that break across Docker stages), `pnpm deploy` creates a self-contained directory at `/standalone` with:
- A flat `node_modules/` with no symlinks
- Only production dependencies (no devDeps)
- The `package.json` of the target app

The runner stage then does `COPY --from=builder /standalone .` to get a clean, self-contained install.

---

## 9. Non-Root Containers — Why It Matters

By default, processes inside Docker containers run as `root`. If your application has a vulnerability that allows command execution, the attacker runs commands as root — potentially with the ability to escape the container or modify the host filesystem.

The fix is simple:
```dockerfile
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp
USER nodeapp
```

From this line forward, the process runs as an unprivileged user. An exploited app process can read files the `nodeapp` user can read — which is just the app itself, nothing else.

This is also why we can't use `HEALTHCHECK CMD curl ...` — `curl` isn't installed, and installing it would add attack surface. We use `wget` which Alpine includes by default.

---

## 10. Local CI Tools

### `pnpm ci:fast` (~15 seconds)
Runs lint + Prettier + TypeScript + unit tests. No Docker required. Designed to be fast enough to run before every commit. Automatically runs via the pre-push hook if you've activated it.

### `pnpm ci:local` (~5 minutes)
The full local pipeline. Runs everything `ci:fast` does, plus:
- Integration tests (needs Docker for Testcontainers)
- Gitleaks via Docker image (no Gitleaks binary install needed)
- All three Docker builds
- Trivy scan of each image via Docker

**What it skips:** Snyk and SonarCloud — both require tokens and API calls to external services. These only run in GitHub Actions.

### Pre-push hook (`.githooks/pre-push`)
Runs `pnpm ci:fast` automatically every time you do `git push`. To activate it once:
```bash
git config core.hooksPath .githooks
```

This is not automatic — every developer activates it once on their machine. It prevents "oops, forgot to lint" pushes that then fail CI and waste a CI run.

---

## 11. GitHub Secrets to Configure

These must be set in the GitHub repository settings (`Settings → Secrets and variables → Actions`):

| Secret | Where to get it | What it does |
|---|---|---|
| `SNYK_TOKEN` | snyk.io → Account Settings → Auth Token | Authenticates Snyk SCA scan |
| `SONAR_TOKEN` | sonarcloud.io → My Account → Security → Generate Token | Authenticates SonarCloud analysis |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — you don't configure it.

`SONAR_ORGANIZATION` is in `sonar-project.properties` (value: `lmmoreira`) — it's not a secret because it's a public SonarCloud organization name.

---

## 12. What Happens When a Gate Fails

Each failing job appears in the PR checks list with a red ✗. GitHub branch protection is configured to require these checks before merge — the "Merge" button is greyed out.

To fix a failing gate:
1. Read the job log in GitHub Actions — it shows exactly which file and line caused the failure
2. Fix the issue locally
3. Run `pnpm ci:fast` locally to verify
4. Push the fix — the workflows re-run automatically

Common failures and their fixes:
- **ESLint** — look at the specific rule: `no-explicit-any` means replace `any` with a proper type; `no-console` means use `AppLogger`
- **Prettier** — run `pnpm prettier --write .` locally and commit the formatted files
- **TypeScript** — fix the type error; never use `@ts-ignore`
- **Gitleaks** — if it's a false positive, add the pattern to `.gitleaks.toml` allowlist; if it's a real secret, remove it from git history with `git filter-branch` or BFG Repo Cleaner
- **Snyk** — update the vulnerable dependency; if no fix is available, check if Snyk offers an ignore policy for the specific CVE
- **Trivy** — usually fixed by updating the base image (`FROM node:20-alpine` → pull a newer digest) or removing the vulnerable package
- **Checkov** — fix the Terraform misconfiguration; Checkov output includes the rule ID and a link to remediation guidance

---

## Summary

| Tool | Class | Catches |
|---|---|---|
| ESLint | Code quality | Style violations, anti-patterns, type misuse |
| Prettier | Formatting | Non-canonical code formatting |
| TypeScript | Type safety | Type errors across all workspaces |
| SonarCloud | Deep analysis + coverage | Bugs, security hotspots, coverage drop on changed code |
| Gitleaks | Secret scanning | Hardcoded credentials in git history |
| Snyk | Dependency scanning | Known CVEs in npm dependencies |
| Trivy | Image scanning | CVEs in Docker image layers (OS + runtime + app) |
| Checkov | IaC scanning | Terraform misconfigurations before deploy |
