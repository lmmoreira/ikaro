# Guards the bucket-naming convention, the public_access_prevention asymmetry
# between the two buckets, CORS config, and the tmp/-prefixed +
# incomplete-multipart lifecycle rules this module's acceptance criteria
# depend on (M17-S14).

mock_provider "google" {}

variables {
  project_id   = "ikaro-test"
  environment  = "staging"
  cors_origins = ["https://ikaro-web-729809528251.southamerica-east1.run.app"]
}

run "bucket_names_carry_environment_suffix" {
  command = plan

  assert {
    condition     = google_storage_bucket.uploads.name == "ikaro-uploads-staging"
    error_message = "Uploads bucket must be named ikaro-uploads-{env}."
  }

  assert {
    condition     = google_storage_bucket.public.name == "ikaro-public-staging"
    error_message = "Public bucket must be named ikaro-public-{env}."
  }
}

run "public_access_prevention_is_asymmetric" {
  command = plan

  assert {
    condition     = google_storage_bucket.uploads.public_access_prevention == "enforced"
    error_message = "Uploads bucket must enforce public_access_prevention at the bucket level — it must never serve an anonymous read."
  }

  assert {
    condition     = google_storage_bucket.public.public_access_prevention == "inherited"
    error_message = "Public bucket must inherit the project-level org-policy exception (S07 step 7), not enforce PAP at the bucket level, or the allUsers grant fails."
  }
}

run "public_bucket_grants_anonymous_read_only_on_itself" {
  command = plan

  assert {
    condition     = google_storage_bucket_iam_member.public_viewer.member == "allUsers"
    error_message = "Public bucket must grant allUsers access."
  }

  assert {
    condition     = google_storage_bucket_iam_member.public_viewer.role == "roles/storage.objectViewer"
    error_message = "Public bucket's allUsers grant must be objectViewer, not a write role."
  }

  assert {
    condition     = google_storage_bucket_iam_member.public_viewer.bucket == google_storage_bucket.public.name
    error_message = "allUsers binding must target the public bucket, not the uploads bucket."
  }
}

run "cors_configured_per_bucket" {
  command = plan

  assert {
    condition     = tolist(google_storage_bucket.uploads.cors)[0].origin == var.cors_origins
    error_message = "Uploads bucket CORS origin must equal var.cors_origins."
  }

  assert {
    condition     = tolist(google_storage_bucket.uploads.cors)[0].method == tolist(["PUT", "GET"])
    error_message = "Uploads bucket CORS must allow PUT and GET (signed-URL upload + tmp/ preview read)."
  }

  assert {
    condition     = tolist(google_storage_bucket.public.cors)[0].origin == tolist(["*"])
    error_message = "Public bucket CORS origin must be * — hotsite images are public by definition."
  }

  assert {
    condition     = tolist(google_storage_bucket.public.cors)[0].method == tolist(["GET"])
    error_message = "Public bucket CORS must allow GET only."
  }
}

run "uploads_bucket_has_two_lifecycle_rules_public_has_none" {
  command = plan

  assert {
    condition     = length(google_storage_bucket.uploads.lifecycle_rule) == 2
    error_message = "Uploads bucket must carry exactly two lifecycle rules: incomplete-multipart cleanup + tmp/ staging cleanup."
  }

  assert {
    condition     = length(google_storage_bucket.public.lifecycle_rule) == 0
    error_message = "Public bucket must carry no age-based lifecycle rules — hotsite assets are permanent (M17-S45 decision)."
  }
}

run "tmp_prefix_lifecycle_rule_deletes_at_two_days" {
  command = plan

  assert {
    condition = anytrue([
      for rule in google_storage_bucket.uploads.lifecycle_rule :
      one(rule.action).type == "Delete" && one(rule.condition).age == 2 && one(rule.condition).matches_prefix == tolist(["tmp/"])
    ])
    error_message = "Uploads bucket must delete tmp/-prefixed objects at age 2 days (TD22)."
  }
}

run "incomplete_multipart_upload_rule_at_seven_days" {
  command = plan

  assert {
    condition = anytrue([
      for rule in google_storage_bucket.uploads.lifecycle_rule :
      one(rule.action).type == "AbortIncompleteMultipartUpload" && one(rule.condition).age == 7
    ])
    error_message = "Uploads bucket must abort incomplete multipart uploads at age 7 days."
  }
}
