#!/usr/bin/env bash
# scripts/pre-pr.sh
# Mechanical pre-PR checks — all grep and file-existence based.
# Run from repo root. Exits with issue count (0 = all clear).
#
# Covers: pre-pr checks 1,5,6,7,11,12,14,15,16,17,18, W1 (web vitest setup) and domain-audit DA-2,DA-3,DA-4,DA-5,DA-7.
# The remaining checks require agent reasoning and are listed at the end.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

ISSUES=0
BRANCH=$(git rev-parse --abbrev-ref HEAD)
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

changed=$(git diff main...HEAD --name-only 2>/dev/null || true)
added=$(git diff main...HEAD --name-only --diff-filter=A 2>/dev/null || true)

ts_all=$(echo "$changed"  | grep -E '\.ts$'                                             || true)
ts_prod=$(echo "$ts_all"  | grep -vE '\.spec\.ts$|\.integration\.spec\.ts$|[/\\]test[/\\]' || true)
ts_domain_app=$(echo "$ts_prod" | grep -E '/domain/|/application/'                      || true)
ts_controllers=$(echo "$ts_prod" | grep -E '\.controller\.ts$'                          || true)
ts_tests=$(echo "$ts_all"  | grep -E '\.(spec|integration\.spec)\.ts$'                  || true)
ts_new_prod=$(echo "$added" | grep -E '\.ts$' | grep -vE '\.spec\.|[/\\]test[/\\]'      || true)

# Write grep hits for a newline-separated file list into $TMP
grep_into_tmp() {
  local files="$1" pattern="$2"
  > "$TMP"
  [ -z "$files" ] && return
  while IFS= read -r f; do
    [ -z "$f" ] || [ ! -f "$f" ] && continue
    grep -nE "$pattern" "$f" 2>/dev/null | sed "s|^|$f:|" >> "$TMP" || true
  done <<< "$files"
}

# Report pass/fail based on $TMP content; increments ISSUES
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

# ── 1. No HTTP-layer NestJS imports in domain/application ────────────────────
# @Injectable / @Inject are legitimate in use cases — only HTTP-layer symbols are forbidden
grep_into_tmp "$ts_domain_app" \
  "HttpException|HttpStatus|from 'class-validator|from 'class-transformer|@(Get|Post|Put|Patch|Delete|Body|Param|Query|Controller)\b"
run_check "1. No HTTP-layer imports in domain/application layers"

# ── 5. No infra tokens in controllers ────────────────────────────────────────
grep_into_tmp "$ts_controllers" \
  "@InjectRepository\(|DataSource\b|EntityManager\b|Repository<"
run_check "5. No infra tokens injected in controllers"

# ── 6. No inline safeParse / z.object in backend controllers ─────────────────
# BFF defines Zod schemas at module level by design — only check apps/backend/
ts_backend_controllers=$(echo "$ts_controllers" | grep '^apps/backend/' || true)
grep_into_tmp "$ts_backend_controllers" \
  "\.safeParse\(|z\.object\(|z\.string\("
run_check "6. No inline safeParse / z.object in backend controllers"

# ── 7. No \`any\` / @ts-ignore in production ──────────────────────────────────
grep_into_tmp "$ts_prod" \
  " as any\b|: any\b|@ts-ignore"
run_check "7. No \`any\` / @ts-ignore in production"

# ── 11. No new XxxEntity() / entity+use-case factories in tests ──────────────
# Narrow make* to Entity/UseCase/Aggregate — service/context/handler helpers are acceptable
grep_into_tmp "$ts_tests" \
  "new [A-Z][a-zA-Z]+Entity\(|function make[A-Z][a-zA-Z]*(Entity|UseCase|Aggregate)\b"
run_check "11. No new XxxEntity() or entity/use-case make* factories in tests"

# ── 12. Zod v3 patterns / as unknown as ──────────────────────────────────────
grep_into_tmp "$ts_prod" \
  "z\.string\(\)\.(uuid|url|email)\(\)|as unknown as"
run_check "12. No Zod v3 / as unknown as in production (review each hit)"

# ── 16. No .skip() / .only() in tests ────────────────────────────────────────
grep_into_tmp "$ts_tests" \
  "it\.skip\(|test\.skip\(|describe\.skip\(|it\.only\(|test\.only\(|describe\.only\(|^xit\(|^xdescribe\("
run_check "16. No .skip() / .only() in tests"

# ── 17. No console.* in production ───────────────────────────────────────────
grep_into_tmp "$ts_prod" \
  "console\.(log|error|warn)\("
run_check "17. No console.log/error/warn in production"

# ── 18. No barrel imports from ports/ or shared/domain/ ──────────────────────
grep_into_tmp "$ts_all" \
  "from '[^']*/ports'|from \"[^\"]+/ports\"|from '[^']*/shared/domain'|from \"[^\"]+/shared/domain\""
run_check "18. No barrel imports from ports/ or shared/domain/"

# ── 14. Missing .spec.ts for new use cases / controllers ─────────────────────
> "$TMP"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && printf "%s — missing %s\n" "$f" "$spec" >> "$TMP"
done <<< "$(echo "$added" | grep -E '\.(use-case|controller)\.ts$' | grep -v '\.spec\.' || true)"
run_check "14. All new use cases / controllers have .spec.ts"

# ── 15. New @Injectable() classes registered in module ───────────────────────
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

# ── Web checks ───────────────────────────────────────────────────────────────
printf "\n### Web checks\n"

# W1: vitest.setup.ts must import /vitest entrypoint, not bare jest-dom
> "$TMP"
if [ -f "apps/web/vitest.setup.ts" ]; then
  grep -n "jest-dom'" apps/web/vitest.setup.ts | grep -v "jest-dom/vitest" >> "$TMP" || true
fi
run_check "W1. vitest.setup.ts uses @testing-library/jest-dom/vitest (not bare)"

# ── Domain Audit — grep-based ─────────────────────────────────────────────────
printf "\n### Domain Audit (grep)\n"

# DA-2: duplicated isValid / inline validation outside value-objects
grep -rn --include="*.ts" \
  "function isValid\|const isValid\|Intl\.supportedValuesOf" \
  apps/backend/src/contexts apps/backend/src/shared 2>/dev/null \
  | grep -v "/value-objects/" | grep -v "\.spec\.ts:" > "$TMP" || true
run_check "DA-2. No inline isValid outside value-objects"

# DA-3: entity/use-case make* factories in specs (entire codebase)
# Narrow to Entity/UseCase/Aggregate — service/context/handler helpers are acceptable
grep -rn \
  --include="*.spec.ts" --include="*.integration.spec.ts" \
  "function make[A-Z][a-zA-Z]*Entity\b\|function make[A-Z][a-zA-Z]*UseCase\b\|function make[A-Z][a-zA-Z]*Aggregate\b" \
  apps/backend/src 2>/dev/null > "$TMP" || true
run_check "DA-3. No entity/use-case make* factories in spec files"

# DA-5: DDL in seed files
grep -rn --include="*.ts" \
  "CREATE TABLE\|CREATE SCHEMA\|DROP TABLE\|DROP SCHEMA\|ensureSchemas\|createSchemas\|createTable" \
  apps/backend/src/shared/database/ 2>/dev/null > "$TMP" || true
run_check "DA-5. No DDL in seed files"

# DA-4: every TypeORM entity has an XxxEntityBuilder
> "$TMP"
while IFS= read -r entity_file; do
  cls=$(grep -oE 'export class [A-Za-z]+Entity\b' "$entity_file" 2>/dev/null | head -1 | awk '{print $3}' || true)
  [ -z "$cls" ] && continue
  ctx=$(echo "$entity_file" | grep -oE 'contexts/[^/]+' | head -1 | sed 's|contexts/||' || true)
  [ -z "$ctx" ] && continue
  builder_dir="apps/backend/src/test/builders/$ctx"
  if ! find "$builder_dir" -name "*.builder.ts" 2>/dev/null \
       | xargs grep -l "$cls" 2>/dev/null \
       | grep -q .; then
    printf "%s — no builder in %s\n" "$cls" "$builder_dir" >> "$TMP"
  fi
done < <(find apps/backend/src -path "*/infrastructure/entities/*.entity.ts" ! -name "*.spec.ts" 2>/dev/null)
run_check "DA-4. All TypeORM entities have an XxxEntityBuilder"

# DA-7: Builder fields without a withXxx() setter must be readonly (S2933)
# For each *.builder.ts in src/test/builders/, find private fields that are NOT
# prefixed 'readonly' and have no corresponding 'with<FieldName>(' method.
> "$TMP"
while IFS= read -r builder_file; do
  # Extract non-readonly private field names (initialised with =)
  while IFS= read -r field_name; do
    [ -z "$field_name" ] && continue
    # Build the expected withXxx method name (capitalise first letter)
    setter="with$(echo "${field_name:0:1}" | tr '[:lower:]' '[:upper:]')${field_name:1}("
    if ! grep -q "$setter" "$builder_file"; then
      printf "S2933: '%s' in %s has no setter — mark readonly\n" "$field_name" "$builder_file" >> "$TMP"
    fi
  done < <(grep -oP '(?<=private )\w+(?= =)' "$builder_file" 2>/dev/null || true)
done < <(find apps/backend/src/test/builders -name "*.builder.ts" 2>/dev/null)
run_check "DA-7. Builder fields without setter are readonly (S2933)"

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\n---\n"
if [ "$ISSUES" -eq 0 ]; then
  printf "✅ Script: 0 issues\n\n"
  printf "   Agent checks still required:\n"
  printf "   0  type-check + lint (pnpm --filter X run type-check 2>&1 | grep 'error TS')\n"
  printf "   2  multi-aggregate writes inside txManager.run()\n"
  printf "   3  every new endpoint has a .http block with happy + error cases\n"
  printf "   4  every public controller/service method has explicit return type\n"
  printf "   8  @Global() modules have explanatory comment\n"
  printf "   10 aggregate fields use VO types; getters return the VO\n"
  printf "   13 static routes declared before dynamic routes\n"
  printf "   21 all new <Image fill> in changed .tsx files have a sizes prop\n"
  printf "   DA-1 aggregate props not typed as plain primitives\n"
  printf "   DA-6 no utility functions duplicated outside src/shared/utils/\n"
  printf "   (DA-7 builder readonly check already automated above)\n"
else
  printf "❌ Script: %d issue(s) — fix before running agent checks\n" "$ISSUES"
fi

exit "$ISSUES"
