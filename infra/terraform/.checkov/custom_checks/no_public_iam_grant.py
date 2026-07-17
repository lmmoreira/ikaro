"""Repo-wide compensating control (M17-S14, 2026-07-17): do not assume an
org-level policy will catch a mistaken public IAM grant — see
infra/terraform/README.md's "IAM binding review discipline" section.

Hard-fails any IAM member/binding resource that grants allUsers or
allAuthenticatedUsers, across every IAM resource type used in this repo —
not just storage buckets (Checkov's built-in CKV_GCP_28/CKV_GCP_114 already
cover those). A genuinely intended public grant must be explicitly
suppressed with a documented #checkov:skip=CKV_IKARO_1 rationale, same
discipline as every other Checkov skip in this repo.

Static analysis only — has no visibility into anything outside this repo's
.tf files (a manual gcloud/Console change bypasses it entirely).
"""

from typing import Any

from checkov.common.models.enums import CheckCategories, CheckResult
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck

PUBLIC_PRINCIPALS = {"allUsers", "allAuthenticatedUsers"}

SUPPORTED_RESOURCES = [
    "google_storage_bucket_iam_member",
    "google_storage_bucket_iam_binding",
    "google_project_iam_member",
    "google_project_iam_binding",
    "google_service_account_iam_member",
    "google_service_account_iam_binding",
    "google_secret_manager_secret_iam_member",
    "google_secret_manager_secret_iam_binding",
    "google_artifact_registry_repository_iam_member",
    "google_artifact_registry_repository_iam_binding",
    "google_cloud_run_v2_service_iam_member",
    "google_cloud_run_v2_service_iam_binding",
    "google_pubsub_topic_iam_member",
    "google_pubsub_topic_iam_binding",
    "google_pubsub_subscription_iam_member",
    "google_pubsub_subscription_iam_binding",
]


class NoPublicIamGrant(BaseResourceCheck):
    def __init__(self) -> None:
        super().__init__(
            name="Ensure no IAM member/binding grants allUsers or allAuthenticatedUsers without an explicit, documented skip",
            id="CKV_IKARO_1",
            categories=[CheckCategories.IAM],
            supported_resources=SUPPORTED_RESOURCES,
        )

    def scan_resource_conf(self, conf: dict[str, list[Any]]) -> CheckResult:
        member = conf.get("member")
        if member and member[0] in PUBLIC_PRINCIPALS:
            return CheckResult.FAILED

        members = conf.get("members")
        if members and isinstance(members[0], list) and any(m in PUBLIC_PRINCIPALS for m in members[0]):
            return CheckResult.FAILED

        return CheckResult.PASSED


check = NoPublicIamGrant()
