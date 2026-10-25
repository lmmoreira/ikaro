# @ikaro/hotsite-templates

The platform-owned **hotsite template catalogue**: six versioned compositions a manager can apply to the
draft they are editing. This is the day-to-day guide for whoever maintains it. The production-facing
parts (verifying a release, what to do when the sync step fails) live in `docs/RUNBOOKS.md`.

## What is in the package, and what ships where

| Part | Where | Ships to |
|---|---|---|
| `definitions/<id>.json` | structure: module order, enabled set, variants, `presentation`, image paths, **no visible text** | the backend image (compiled into `dist/`) |
| `copy/<locale>/<id>.json` | the text, keyed `<MODULE_TYPE>.<dotted.path>` | the backend image |
| `asset-manifest.json` | the append-only index of every released image, with its sha256 and size | the backend image |
| `assets/<id>/v<n>/*.webp` | the image binaries (and one `thumbnail.webp` per template and version) | **the public bucket only**, by the deploy pipelines. They never reach the backend image |
| `src/` | the loader, the copy merger, the capability derivation, `buildTemplateManifest` | the backend image |
| `scripts/build-assets.ts` | the developer-only image converter | nowhere |

Applying a template is a pure function: the backend merges a definition with the tenant's language copy
and identity and returns a draft. Nothing is saved, published or copied; the images are referenced by
their shared path, so there is no per-tenant copy and no cleanup. A manager's applied result is an
ordinary editable manifest, so a later catalogue change never touches a tenant's site unless they apply
a template again.

## Folder layout

```
definitions/<id>.json          structure (no visible text, no tenant identity, no SEO)
copy/pt-BR/<id>.json           Portuguese text
copy/en/<id>.json              English text
assets/<id>/v<n>/<name>.webp   images, written once per version
asset-manifest.json            every released object: key, sha256, size
src/                           loader, copy merge, capabilities, asset index
scripts/build-assets.ts        developer tool (see below)
```

An image path is always `shared/hotsite-templates/<id>/v<n>/<file>.webp`. The same prefix is defined once
as `HOTSITE_TEMPLATE_ASSET_PREFIX` in `@ikaro/types`.

## Copy rules

- A definition holds an **empty string** at every text field; the copy file holds the text under the key
  `<MODULE_TYPE>.<dotted.path>` (`HERO.title`, `NAVIGATION.items.0.label`, `TESTIMONIALS.items.1.text`).
  Every module type is a singleton, so the module type is enough to address it.
- Both locales have **exactly the same keys**, and every key must point at an empty text field of the
  definition (and every empty text field must have a key).
- The only interpolation is `{{brandName}}` and `{{tagline}}`, replaced at apply time from the tenant's
  draft. An unknown placeholder, or a `{{` left in the output, fails the build.
- No literal business name, city, year or real-sounding person. Testimonial authors are generic labels
  such as "Cliente satisfeito". A deny-list test fails on the old prototype identities.
- The copy language is the tenant's own `tenants.settings.language` (anything other than `en` falls back
  to `pt-BR`), not the manager's UI language.

## How to add a template

1. Put the source art in a scratch folder, one file per image (`hero.png`, `gallery-1.png`, ...), and run
   the converter (below). It writes the WebP files and a `thumbnail.webp` under `assets/<id>/v1/` and
   appends the new objects to `asset-manifest.json`.
2. Add `definitions/<id>.json`, `copy/pt-BR/<id>.json` and `copy/en/<id>.json`, and register the id in
   `CATALOGUE_TEMPLATE_IDS` (`src/catalogue.ts`) **and** in `HOTSITE_TEMPLATE_IDS`
   (`packages/types/src/hotsite.ts`). Add the picker name and description for the id to both
   `packages/i18n/locales/{pt-BR,en}/web.json` (`dashboard.hotsitePage.templates.<id>`).
3. Let the package tests tell you what is missing (see below).
4. Open a PR. It touches `packages/**` and the locale files only, no infrastructure. On merge, the staging
   deploy uploads the new objects **before** it deploys the backend that references them; promoting to
   production does the same against the production bucket. There is no manual bucket step.

## How to ship a new version of a template

**Never edit a released file.** A tenant that applied `v1` keeps referencing its `v1` paths forever.

1. Run the converter again for the template. It picks the next unreleased version (`v2`) and writes only
   there; it refuses to write into a version that is already in the manifest.
2. Change the definition (it may keep referencing unchanged older-version files) and bump its `version`.
3. Leave every older asset in place.

## How to retire a template from the picker

Remove its id from `CATALOGUE_TEMPLATE_IDS` and `HOTSITE_TEMPLATE_IDS`. Keep its definition and **all of
its assets**: tenants that applied it still reference them, and the asset manifest is how the backend
knows those paths are legitimate. Removing a released asset is never done.

## The two tools, never confused

| Tool / mode | Staging / prod buckets | Local emulator | PR E2E job |
|---|---|---|---|
| `build-assets` (this package) | no | by hand, when adding a template or version | no |
| `sync-hotsite-template-assets` `--emulator` | no | yes: `pnpm infra:up` / `pnpm hotsite-templates:seed` | yes: a seed step after "Seed database" |
| `sync-hotsite-template-assets` (real upload) | **yes, CI deploy pipelines only** (never by hand) | no | no |
| `sync-hotsite-template-assets` `--verify` | **yes, right after the upload, in the same deploy job** | no | no |
| `sync-hotsite-template-assets` `--check-immutability` | staging deploy job | no | no |

`build-assets` converts and never talks to a bucket. `sync-hotsite-template-assets` (in
`packages/infra-scripts`) only makes a bucket match the committed manifest and never converts anything.

### Running the converter

```bash
pnpm --filter @ikaro/hotsite-templates build-assets -- \
  --template casa47 --source /path/to/casa47-art [--version 2] [--thumbnail-from hero]
```

For every PNG/JPEG in the folder it resizes to at most 1600 px wide (never upscaling), encodes WebP and
lowers the quality step by step until the file is at most about 300 KB (it fails, naming the file, if it
cannot), and writes `assets/<id>/v<n>/<name>.webp`. The picker thumbnail (about 640 px wide) is cut from
`hero`, or from `gallery-1` when the template has no `hero` image; `--thumbnail-from` names another
source. Finally it appends the new objects to `asset-manifest.json`. Existing entries are never touched,
and re-running it for a released version fails instead of changing anything.

### Seeding the local emulator

`pnpm infra:up` starts the containers, waits for them to be healthy and then seeds the emulator. When only
the emulator was restarted (it keeps nothing), run `pnpm hotsite-templates:seed` on its own. It creates the
public bucket if it is missing and is safe to repeat.

## What the tests enforce

They are the only gate on the catalogue, so they run everywhere a change can land: `ci:fast` (the pre-push hook), `scripts/ci-local.sh`, and, with coverage, the PR's SonarCloud job. Run them by hand with `pnpm --filter @ikaro/hotsite-templates test`.

| Failing test | What it means |
|---|---|
| `catalogue.spec.ts` | a definition is not valid against the shared manifest schema in one of the two locales, does not list all twelve module types, sets a logo/SEO/brand name, or links a service card to a detail page |
| `copy.spec.ts` | the locales' keys differ, a key points at a field the definition does not have, a text field has no key, a placeholder is unknown, or a deny-listed identity leaked into the copy |
| `asset-manifest.spec.ts` | the manifest and `assets/` disagree (a missing or orphan file, a wrong hash or size), a definition references an unregistered image, or a source URL or file path was left in a definition |
| `capabilities.spec.ts` | a template's derived capability list changed (the list is pinned per template) |
| `scripts/build-assets.spec.ts` | the converter no longer refuses to rewrite a released version |

The backend adapter spec additionally walks every definition with the backend's schema-aware image walker
and requires every path it finds to be registered.

## How the deploy works

Both `migrate-and-deploy` jobs (staging, and production on promote) hold the `app-deployer` identity.
Before anything is migrated or deployed they run the sync tool, then `--verify`:

- **absent** object: uploaded create-only (`ifGenerationMatch: 0`) with `Cache-Control: public, max-age=31536000, immutable`;
- **present, same content**: skipped;
- **present, different content**: the job **fails**: "a changed image must ship as a new `v<n>`".

`--verify` then fetches every manifest path anonymously over its public URL and compares status, content
type, cache header and hash. Staging also runs `--check-immutability`. Immutability is enforced by IAM, not
by convention: the deployer holds only `roles/storage.objectCreator`, conditioned to the `shared/` prefix of
its own environment's public bucket, which cannot overwrite or delete an object. A promotion re-runs the
sync for exactly the SHA being promoted, and a rollback re-runs it as a no-op, because assets are only ever
added.

## PR checklist for a catalogue change

- [ ] No released file under `assets/` was edited or removed; `asset-manifest.json` only gained entries.
- [ ] A new version has a new `v<n>` folder and a bumped definition `version`.
- [ ] Both locales have the same keys; no business name, city, year or person in the copy.
- [ ] `pnpm --filter @ikaro/hotsite-templates test` passes.
- [ ] The id is in `CATALOGUE_TEMPLATE_IDS`, `HOTSITE_TEMPLATE_IDS` and both `web.json` files (if a new template).
