## Description

<!-- What was changed and WHY. -->

## Related

<!-- Link to the story or use case this PR implements. -->
- Story: M0X-SXX
- UC: [UC-XXX](../docs/USE_CASES.md)

## Verification

<!-- Proof that the code works: test output, screenshots, curl responses. -->

## Checklist

- [ ] `pnpm lint` passes — zero warnings
- [ ] `pnpm type-check` passes — zero errors
- [ ] Unit tests added/updated
- [ ] Integration test added/updated (for adapters/repositories)
- [ ] Tenant isolation verified (query/event/log includes `tenant_id`)
- [ ] No hardcoded config values — reads from `tenants.settings`
- [ ] No secrets in code
- [ ] Conventional Commit message used
