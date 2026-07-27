# TD36 — Cloud Run GCS Signed-URL Authentication Failure

**Status:** Completed — implemented in PR #271, merged 2026-07-27  
**Affected environments:** Cloud Run staging and production  
**Affected capability:** GCS V4 signed URLs for booking attachments and hotsite assets

## Problem

The backend returned HTTP 500 when generating a GCS signed URL. The failure was
observed on the signed-URL request path, not during application startup:

```text
Error: Invalid response from metadata service: incorrect Metadata-Flavor header.
Expected 'Google', got no header
    at gcp-metadata@6.1.1
    at google-auth-library@9.15.1
    at @google-cloud/storage@7.21.0 ... signer.js
```

The failing dependency chain was:

```text
@google-cloud/storage@7.21.0
  -> google-auth-library@9.15.1
     -> gcp-metadata@6.1.1
```

The application also had a direct `google-auth-library@10.9.0` dependency, but
that was a separate pnpm dependency instance from the version nested inside
`@google-cloud/storage`.

The issue became visible after PR #268 added:

```ts
universeDomain: 'googleapis.com'
```

to the Storage client. That option was removed as part of the final fix because
the default Google API universe is already `googleapis.com` and the setting was
unnecessary.

## Investigation

### 1. Deployment and request-path verification

PR #268 deployed successfully to Cloud Run. The error did not indicate a
startup failure: it occurred while handling the signed-URL endpoint for booking
attachments.

The backend Cloud Run service used:

- service account: `ikaro-backend@ikaro-staging.iam.gserviceaccount.com`;
- VPC network: `ikaro-vpc-staging`;
- subnet: `ikaro-subnet-staging`;
- egress: `PRIVATE_RANGES_ONLY`;
- no configured proxy environment variables;
- no Cloud NAT.

The service account already had the required Storage permissions and was bound
as a Service Account Token Creator for itself.

### 2. Metadata-server test

A temporary Cloud Run job was created with the same service account, VPC
network, subnet, and egress policy. The following request succeeded:

```text
GET http://metadata.google.internal/computeMetadata/v1/project/project-id
Metadata-Flavor: Google

HTTP/1.1 200 OK
Metadata-Flavor: Google
ikaro-staging
```

The service-account email metadata endpoint also succeeded. Therefore:

- Cloud Run metadata was reachable;
- the required request header worked;
- VPC routing was not the root cause;
- changing Cloud Run egress to `ALL_TRAFFIC` was unnecessary.

### 3. Exact Storage reproduction

A temporary Cloud Run job ran the same `@google-cloud/storage@7.21.0`
`file.getSignedUrl()` call using the production image and service account. It
reproduced the exact `Metadata-Flavor` error, including when
`GCE_METADATA_HOST=metadata.google.internal` was set.

This disproved the Terraform-only fix. The Terraform variable was temporarily
added to both environments, applied, and the application still failed. It was
removed by PR #271.

### 4. `GoogleAuth` injection test

The apparently simpler alternative was tested directly in Cloud Run:

```ts
const auth = new GoogleAuth();
const storage = new Storage({ authClient: auth });
```

This also failed with the same metadata error.

The reason is the pnpm dependency graph. Storage checks whether the supplied
client is an instance of its own nested `GoogleAuth` class. The application’s
`GoogleAuth@10.9.0` instance is not an instance of Storage’s separate
`GoogleAuth@9.15.1` class, so Storage wraps it and continues through the old
nested metadata path.

Therefore, simply passing `new GoogleAuth()` is not a valid fix for this
repository.

### 5. IAM signing test

A temporary Cloud Run job manually performed the lower-level keyless flow:

1. read the service-account email from the metadata server;
2. read an access token from the metadata server;
3. call IAM Credentials `signBlob`;
4. receive a valid signed blob.

The IAM call returned HTTP 200, proving that the service account and
`roles/iam.serviceAccountTokenCreator` permission were correct.

### 6. Complete signed-URL test

The same temporary-job approach then built a GCS V4 canonical request, signed
it with IAM `signBlob`, and used the resulting URLs against real GCS:

```text
SIGNED_URL_PUT_OK
SIGNED_URL_GET_OK
SIGNED_URL_DELETE_OK
```

The test uploaded, downloaded, and deleted a temporary object successfully.
The temporary job, object, and scripts were removed afterward.

## Why the original authentication method failed

The failure was not caused by missing IAM permissions, unavailable metadata, or
the Cloud Run VPC route. It was caused by the old auth implementation nested
inside `@google-cloud/storage@7.21.0`.

That implementation performs metadata-based service-account discovery while
building a signed URL. In this Cloud Run/serverless metadata interaction, the
library rejected the response because the response it observed did not contain
the expected `Metadata-Flavor: Google` header, even though a direct metadata
request from the same runtime returned the header correctly.

The direct application `GoogleAuth` could not be injected cleanly because the
two auth-library copies are different JavaScript class instances.

## Final solution

PR #271 added:

```text
apps/backend/src/shared/infrastructure/gcs/cloud-run-gcs-v4-signer.ts
```

`CloudRunGcsV4Signer` implements the narrow signing flow required by GCS V4:

1. fetch service-account email from Cloud Run metadata with
   `Metadata-Flavor: Google`;
2. fetch an access token from Cloud Run metadata with the same header;
3. build the GCS V4 canonical request and string-to-sign;
4. call IAM Credentials `signBlob` with the access token;
5. append the hexadecimal signature to the GCS signed URL.

Metadata and IAM requests use a five-second `AbortSignal` timeout. Timeout
errors are converted into sanitized operational errors; normal HTTP failures
continue to preserve their response-status handling.

`GcsSignedUrlAdapter` selects the signer only when:

- `K_SERVICE` is present, identifying a Cloud Run service/job;
- `GCS_EMULATOR_HOST` is not configured;
- `GCS_KEY_FILE` is not configured.

All other GCS operations (`exists`, `copy`, and application-level `delete`)
continue using the existing Storage client. Only signed URL generation uses the
Cloud Run-specific signer.

## Local and non-Cloud-Run behavior

Local behavior remains unchanged:

- `GCS_EMULATOR_HOST` continues to use the fake GCS emulator;
- `GCS_KEY_FILE` continues to use a local service-account key when configured;
- environments without `K_SERVICE` continue using the existing Storage client
  signed-URL path.

`K_SERVICE` is injected automatically by Cloud Run and must not be declared in
Terraform or local `.env` files.

## Infrastructure changes

The temporary `GCE_METADATA_HOST` environment variable and explanatory comments
were removed from:

- `infra/terraform/envs/staging/main.tf`;
- `infra/terraform/envs/prod/main.tf`.

No `ALL_TRAFFIC`, Cloud NAT, proxy, service-account key, or network-routing
change is required for this solution.

## Validation

PR #271 passed:

- focused GCS tests, including Cloud Run signer and adapter branch coverage;
- backend type-check and lint;
- full backend unit tests;
- full BFF unit tests;
- backend integration tests;
- BFF component tests;
- Playwright E2E tests;
- Terraform validation, formatting, plans, and module tests;
- Checkov, Trivy, Snyk, Gitleaks, and dependency review.

The SonarCloud finding for `charCodeAt` was fixed by using `codePointAt`, and
the follow-up commit passed the repository pre-push checks.

## Operational follow-up

After deployment, verify the real staging service with the booking attachment
signed-URL endpoint and confirm a PUT upload succeeds. Then verify the hotsite
signed upload/read path. Production should receive the same application image
and Terraform cleanup after staging validation.

The IAM permission required for the keyless path is:

```text
roles/iam.serviceAccountTokenCreator
```

It must remain granted to the runtime service account on itself, alongside the
existing bucket-level Storage permissions.
