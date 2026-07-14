#!/usr/bin/env bash
# scripts/pre-pr.sh
# Mechanical pre-PR checks — grep and file-existence based.
# Run from repo root. Exits with issue count (0 = all clear).
#
# Covers: checks 1,5,6,7,11,12,14,15,16,17,18,22,23,24,25,26,27,28
#         W1 (web vitest setup entrypoint)
#         WEB-1/WEB-4/WEB-5/WEB-6/WEB-7
#         E2E-1/E2E-2/E2E-3
#         BE-2/BE-3/BE-4/BE-5/BE-7 (changed files only — bad-smell-audit covers full codebase)
#
# Agent reasoning checks → pre-pr.md Step 3a
# Structural full-codebase scan → pre-pr.md Step 3b (/bad-smell-audit per layer)

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

ISSUES=0
BRANCH=$(git rev-parse --abbrev-ref HEAD)
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

changed=$(git diff main...HEAD --name-only 2>/dev/null || true)
added=$(git diff main...HEAD --name-only --diff-filter=A 2>/dev/null || true)

# ── File-list variables ───────────────────────────────────────────────────────
ts_all=$(echo "$changed" | grep -E '\.(ts|tsx)$' || true)
ts_prod=$(echo "$ts_all" | grep -vE '\.(spec|integration\.spec)\.(ts|tsx)$|[/\\]test[/\\]' || true)
ts_domain_app=$(echo "$ts_prod" | grep -E '/domain/|/application/' || true)
ts_controllers=$(echo "$ts_prod" | grep -E '\.controller\.ts$' || true)
ts_tests=$(echo "$ts_all" | grep -E '\.(spec|integration\.spec)\.(ts|tsx)$' || true)
ts_new_prod=$(echo "$added" | grep -E '\.(ts|tsx)$' | grep -vE '\.(spec|integration\.spec)\.' | grep -vE '[/\\]test[/\\]' || true)
ts_modules=$(echo "$ts_prod" | grep -E '\.module\.ts$' || true)
ts_use_cases=$(echo "$ts_prod" | grep -E '\.use-case\.ts$' || true)

web_tsx_prod=$(echo "$ts_prod" | grep '^apps/web/' | grep -E '\.tsx$' || true)
web_tsx_all=$(echo "$ts_all" | grep '^apps/web/' | grep -E '\.tsx$' || true)
web_spec_tsx_added=$(echo "$added" | grep '^apps/web/components/' | grep -E '\.spec\.tsx$' || true)
web_dashboard_tsx=$(echo "$ts_prod" | grep -E '^apps/web/components/(dashboard|account)/' | grep -E '\.tsx$' || true)

# ── Helpers ───────────────────────────────────────────────────────────────────

# Write grep hits for a newline-separated file list into $TMP
grep_into_tmp() {
  local files="$1" pattern="$2"
  > "$TMP"
  [ -z "$files" ] && return
  while IFS= read -r f; do
    [ -z "$f" ] || [ ! -f "$f" ] && continue
    grep -nE -- "$pattern" "$f" 2>/dev/null | sed "s|^|$f:|" >> "$TMP" || true
  done <<< "$files"
}

# Print pass/fail; increment ISSUES on fail
run_check() {
  local label="$1"
  if [ -s "$TMP" ]; then
    printf "  ❌ %s\n" "$label"
    while IFS= read -r l; do printf "     %s\n" "$l"; done < "$TMP"
    ISSUES=$((ISSUES + 1))
  else
    printf "  ✅ %s\n" "$label"
  fi
}

printf "## Pre-PR Script — %s\n\n" "$BRANCH"

# ── Architecture / layer checks ───────────────────────────────────────────────

# 1. No HTTP-layer NestJS imports in domain/application
grep_into_tmp "$ts_domain_app" \
  "HttpException|HttpStatus|from 'class-validator|from 'class-transformer|@(Get|Post|Put|Patch|Delete|Body|Param|Query|Controller)\b"
run_check "1. No HTTP-layer imports in domain/application layers"

# 5. No infra tokens in controllers
grep_into_tmp "$ts_controllers" \
  "@InjectRepository\(|DataSource\b|EntityManager\b|Repository<"
run_check "5. No infra tokens injected in controllers"

# 6. No inline safeParse / z.object in backend controllers
ts_backend_controllers=$(echo "$ts_controllers" | grep '^apps/backend/' || true)
grep_into_tmp "$ts_backend_controllers" \
  "\.safeParse\(|z\.object\(|z\.string\("
run_check "6. No inline safeParse / z.object in backend controllers"

# 7. No \`any\` / @ts-ignore in production
grep_into_tmp "$ts_prod" \
  " as any\b|: any\b|@ts-ignore"
run_check "7. No \`any\` / @ts-ignore in production"

# 22. No throw new HttpException in use-case files
grep_into_tmp "$ts_use_cases" "throw new HttpException"
run_check "22. No throw new HttpException in use-case files (belongs in mapXxxError)"

# 24. No useExisting adapter token anti-pattern in module providers
grep_into_tmp "$ts_modules" "useExisting:"
run_check "24. No useExisting in module providers — use useClass (CLAUDE.md §8)"

# 18. No barrel imports from ports/ or shared/domain/
grep_into_tmp "$ts_all" \
  "from '[^']*/ports'|from \"[^\"]+/ports\"|from '[^']*/shared/domain'|from \"[^\"]+/shared/domain\""
run_check "18. No barrel imports from ports/ or shared/domain/"

# ── Code quality checks ───────────────────────────────────────────────────────

# 12. No Zod v3 patterns / as unknown as
grep_into_tmp "$ts_prod" \
  "z\.string\(\)\.(uuid|url|email)\(\)|as unknown as"
run_check "12. No Zod v3 / as unknown as in production (review each hit)"

# 17. No console.* in production (apps/web has no AppLogger equivalent — the
# resolve-error-message.ts console.warn calls are a deliberate TD23 §7 observability
# signal for an unresolvable/mismatched error code, not a debug leftover)
grep_into_tmp "$(echo "$ts_prod" | grep -v 'shared/lib/i18n/resolve-error-message\.ts$')" \
  "console\.(log|error|warn)\("
run_check "17. No console.log/error/warn in production"

# 16. No .skip() / .only() in tests
grep_into_tmp "$ts_tests" \
  "it\.skip\(|test\.skip\(|describe\.skip\(|it\.only\(|test\.only\(|describe\.only\(|^xit\(|^xdescribe\("
run_check "16. No .skip() / .only() in tests"

# 11. No new XxxEntity() / entity+use-case factories in tests
grep_into_tmp "$ts_tests" \
  "new [A-Z][a-zA-Z]+Entity\(|function make[A-Z][a-zA-Z]*(Entity|UseCase|Aggregate)\b"
run_check "11. No new XxxEntity() or entity/use-case make* factories in tests"

# ── File existence checks ─────────────────────────────────────────────────────

# 14. Missing .spec.ts for new use cases / controllers
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && printf "%s — missing %s\n" "$f" "$spec" >> "$TMP"
done <<< "$(echo "$added" | grep -E '\.(use-case|controller)\.ts$' | grep -v '\.spec\.' || true)"
run_check "14. All new use cases / controllers have .spec.ts"

# 15. New @Injectable() classes registered in module
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  cls=$(grep -A3 "@Injectable" "$f" 2>/dev/null | grep -oE 'class [A-Za-z]+' | head -1 | awk '{print $2}' || true)
  [ -z "$cls" ] && continue
  ctx_path=$(echo "$f" | grep -oE 'apps/backend/src/contexts/[^/]+' | head -1 || true)
  [ -z "$ctx_path" ] && continue
  mod=$(find "$ctx_path" -name "*.module.ts" 2>/dev/null | head -1 || true)
  if [ -n "$mod" ] && ! grep -q "$cls" "$mod" 2>/dev/null; then
    printf "%s not registered in %s\n" "$cls" "$mod" >> "$TMP"
  fi
done <<< "$ts_new_prod"
run_check "15. All new @Injectable() classes registered in module"

# 25. New entity files declare tenant_id column
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  grep -q "tenant_id" "$f" 2>/dev/null || \
    printf "%s — no tenant_id column found (multi-tenancy invariant)\n" "$f" >> "$TMP"
done <<< "$(echo "$added" | grep -E '\.entity\.ts$' | grep -v '\.spec\.' || true)"
run_check "25. New entity files declare tenant_id column"

# ── Web checks ────────────────────────────────────────────────────────────────
printf "\n### Web checks\n"

# W1. vitest.setup.ts uses /vitest entrypoint
> "$TMP"
if [ -f "apps/web/vitest.setup.ts" ]; then
  grep -n "jest-dom'" apps/web/vitest.setup.ts | grep -v "jest-dom/vitest" >> "$TMP" || true
fi
run_check "W1. vitest.setup.ts uses @testing-library/jest-dom/vitest (not bare)"

# WEB-1. dangerouslySetInnerHTML — always requires sanitization review (agent check)
grep_into_tmp "$web_tsx_prod" "dangerouslySetInnerHTML"
run_check "WEB-1. dangerouslySetInnerHTML in changed files — verify sanitization (Step 3a)"

# WEB-4. New component spec files missing // @vitest-environment jsdom on line 1
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  first_line=$(head -1 "$f" 2>/dev/null || true)
  [ "$first_line" != "// @vitest-environment jsdom" ] && \
    printf "%s — missing '// @vitest-environment jsdom' on line 1\n" "$f" >> "$TMP"
done <<< "$web_spec_tsx_added"
run_check "WEB-4. New component spec files have // @vitest-environment jsdom on line 1"

# 23. Missing .spec.tsx for new web component files
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  spec="${f%.tsx}.spec.tsx"
  [ ! -f "$spec" ] && printf "%s — missing %s\n" "$f" "$spec" >> "$TMP"
done <<< "$(echo "$added" | grep '^apps/web/components/' | grep -E '\.tsx$' | grep -v '\.spec\.tsx$' || true)"
run_check "23. All new apps/web/components .tsx files have a .spec.tsx"

# WEB-5. No unit spec files sibling to page.tsx / layout.tsx (E2E only)
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  dir=$(dirname "$f")
  if [ -f "$dir/page.tsx" ] || [ -f "$dir/layout.tsx" ]; then
    printf "%s — spec sibling to page/layout; test via Playwright E2E only\n" "$f" >> "$TMP"
  fi
done <<< "$(echo "$added" | grep '^apps/web/app/' | grep -E '\.(spec|test)\.(ts|tsx)$' || true)"
run_check "WEB-5. No unit spec files sibling to page.tsx / layout.tsx (E2E only)"

# WEB-6. Bare Node.js built-in imports without node: prefix
grep_into_tmp "$web_tsx_prod" \
  "from '(path|fs|os|crypto|stream|util|url|events)'"
run_check "WEB-6. No bare Node.js built-in imports in web (use node: prefix)"

# WEB-7. apps/web/features/**/api/** type name collision with @ikaro/types
> "$TMP"
ikaro_types_exports=$(grep -hoE "^export (interface|type) [A-Za-z]+" packages/types/src/*.ts 2>/dev/null \
  | awk '{print $3}' | sort -u || true)
web_api_changed=$(echo "$ts_prod" | grep -E '^apps/web/features/.*/api(\.ts|/)' || true)
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    if echo "$ikaro_types_exports" | grep -qx "$name"; then
      printf "%s declares '%s' — also in @ikaro/types; verify shapes match\n" "$f" "$name" >> "$TMP"
    fi
  done < <(grep -oE "^export (interface|type) [A-Za-z]+" "$f" 2>/dev/null | awk '{print $3}')
done <<< "$web_api_changed"
run_check "WEB-7. apps/web/features/**/api/** type names checked against @ikaro/types"

# 27. No --ba-* CSS variables in dashboard/account components
grep_into_tmp "$web_dashboard_tsx" '--ba-'
run_check "27. No --ba-* CSS variables in dashboard/account components (hotsite-only; use Tailwind)"

# 28. New entity file added → integration-global-setup.ts must also be updated
> "$TMP"
new_entities=$(echo "$added" | grep -E '\.entity\.ts$' | grep -v '\.spec\.' || true)
if [ -n "$new_entities" ]; then
  echo "$changed" | grep -q 'integration-global-setup\.ts' || \
    printf "New entity added but integration-global-setup.ts not in changeset — register the entity or silent test failures will occur\n" >> "$TMP"
fi
run_check "28. integration-global-setup.ts updated when new entity added"

# 26. i18n locale files updated in sync (en + pt-BR)
> "$TMP"
if echo "$changed" | grep -q 'packages/i18n/locales/en/web\.json'; then
  echo "$changed" | grep -q 'packages/i18n/locales/pt-BR/web\.json' || \
    printf "en/web.json changed but pt-BR/web.json did not — both must be updated together\n" >> "$TMP"
elif echo "$changed" | grep -q 'packages/i18n/locales/pt-BR/web\.json'; then
  echo "$changed" | grep -q 'packages/i18n/locales/en/web\.json' || \
    printf "pt-BR/web.json changed but en/web.json did not — both must be updated together\n" >> "$TMP"
fi
run_check "26. i18n locale files updated in sync (en + pt-BR)"

# ── E2E quality checks ────────────────────────────────────────────────────────
if [ -d "apps/web/e2e" ]; then

printf "\n### E2E quality checks\n"

# E2E-1. No getByLabel/getByText in e2e specs (breaks under i18n)
> "$TMP"
if find apps/web/e2e -name "*.spec.ts" | xargs grep -lnE \
    "getByLabel\(|getByText\(" 2>/dev/null | grep -q .; then
  find apps/web/e2e -name "*.spec.ts" \
    | xargs grep -nE "getByLabel\(|getByText\(" 2>/dev/null >> "$TMP" || true
fi
run_check "E2E-1. No getByLabel/getByText in e2e/ — use data-testid"

# E2E-2. No ISO date embedded in data-testid values
grep_into_tmp "$web_tsx_all" \
  'data-testid="[^"]*[0-9]{4}-[0-9]{2}-[0-9]{2}[^"]*"'
run_check "E2E-2. No ISO date embedded in data-testid — use data-date attribute"

# E2E-3. No template-literal data-testid
grep_into_tmp "$web_tsx_all" \
  'data-testid=\{`'
run_check "E2E-3. No template-literal data-testid — encode data in separate data-* attribute"

fi

# ── Bad-Smell — Backend (changed files only) ─────────────────────────────────
printf "\n### Bad-Smell — Backend (changed files; /bad-smell-audit covers full codebase)\n"

# BE-2. Inline isValid / validation outside value-objects — changed domain/application files
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  echo "$f" | grep -q "/value-objects/" && continue
  grep -nE "function isValid|const isValid|Intl\.supportedValuesOf" "$f" 2>/dev/null \
    | sed "s|^|$f:|" >> "$TMP" || true
done <<< "$ts_domain_app"
run_check "BE-2. No inline isValid outside value-objects (changed domain/application files)"

# BE-3. entity/use-case make* factories in spec files — changed test files only
grep_into_tmp "$ts_tests" \
  "function make[A-Z][a-zA-Z]*Entity\b|function make[A-Z][a-zA-Z]*UseCase\b|function make[A-Z][a-zA-Z]*Aggregate\b"
run_check "BE-3. No entity/use-case make* factories in spec files (changed test files)"

# BE-4. New TypeORM entities / domain events / commands must have a builder
> "$TMP"
while IFS= read -r src_file; do
  [ -z "$src_file" ] || [ ! -f "$src_file" ] && continue
  if echo "$src_file" | grep -qE '\.entity\.ts$'; then
    cls=$(grep -oE 'export class [A-Za-z]+Entity\b' "$src_file" 2>/dev/null | head -1 | awk '{print $3}' || true)
  else
    # .event.ts / .command.ts — classes extend DomainEvent or Command, no fixed name suffix
    cls=$(grep -oE 'export class [A-Za-z]+ extends' "$src_file" 2>/dev/null | head -1 | awk '{print $3}' || true)
  fi
  [ -z "$cls" ] && continue
  ctx=$(echo "$src_file" | grep -oE 'contexts/[^/]+' | head -1 | sed 's|contexts/||' || true)
  [ -z "$ctx" ] && continue
  builder_dir="apps/backend/src/test/builders/$ctx"
  if ! find "$builder_dir" -name "*.builder.ts" 2>/dev/null \
       | xargs grep -l "$cls" 2>/dev/null \
       | grep -q .; then
    printf "%s — no builder found in %s\n" "$cls" "$builder_dir" >> "$TMP"
  fi
done < <(echo "$added" | grep -E '\.(entity|event|command)\.ts$' | grep -v '\.spec\.' || true)
run_check "BE-4. All new TypeORM entities / domain events / commands have a builder"

# BE-5. DDL in seed files (stable dir — full scan OK)
grep -rn --include="*.ts" \
  "CREATE TABLE\|CREATE SCHEMA\|DROP TABLE\|DROP SCHEMA\|ensureSchemas\|createSchemas\|createTable" \
  apps/backend/src/shared/database/ 2>/dev/null > "$TMP" || true
run_check "BE-5. No DDL in seed files"

# BE-7. Builder fields without setter must be readonly — changed builder files only
> "$TMP"
changed_builders=$(echo "$changed" | grep 'apps/backend/src/test/builders' | grep -E '\.builder\.ts$' || true)
while IFS= read -r builder_file; do
  [ -z "$builder_file" ] || [ ! -f "$builder_file" ] && continue
  while IFS= read -r field_name; do
    [ -z "$field_name" ] && continue
    setter="with$(echo "${field_name:0:1}" | tr '[:lower:]' '[:upper:]')${field_name:1}("
    if ! grep -q "$setter" "$builder_file"; then
      printf "S2933: '%s' in %s has no setter — mark readonly\n" "$field_name" "$builder_file" >> "$TMP"
    fi
  done < <(grep -oP '(?<=private )\w+(?= =)' "$builder_file" 2>/dev/null || true)
done <<< "$changed_builders"
run_check "BE-7. Builder fields without setter are readonly — S2933 (changed builders)"

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\n---\n"
if [ "$ISSUES" -eq 0 ]; then
  printf "✅ Script: 0 issues\n\n"
  printf "   Proceed to pre-pr.md Steps 2–Final:\n"
  printf "   Step 2   type-check + lint per changed app\n"
  printf "   Step 3a  agent reasoning checks\n"
  printf "   Step 3b  /bad-smell-audit <layer> per changed layer\n"
  printf "   Step 4   unit tests + coverage ≥ 85%% on changed files\n"
  printf "   Step 5   integration + component tests\n"
else
  printf "❌ Script: %d issue(s) — fix before running agent checks\n" "$ISSUES"
fi

exit "$ISSUES"
