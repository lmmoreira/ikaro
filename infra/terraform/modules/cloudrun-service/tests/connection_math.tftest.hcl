# Guards the connection-math invariant that protects db-f1-micro's ~25-connection
# ceiling from being silently exceeded by the backend's per-instance TypeORM pool
# (M17 plan §S18 "Connection-math invariant"). command = plan + mock_provider only —
# no credentials, no real resources, runs in the S24 PR job.

mock_provider "google" {}

variables {
  project_id            = "ikaro-staging"
  environment           = "staging"
  service_name          = "ikaro-backend"
  service_account_email = "ikaro-backend@ikaro-staging.iam.gserviceaccount.com"
  port                  = 3001
  image                 = "gcr.io/cloudrun/hello"
  db_pool_size          = 3
}

run "valid_combination_on_f1_micro_plans_clean" {
  command = plan

  variables {
    db_tier            = "db-f1-micro"
    max_instance_count = 6
  }

  assert {
    condition     = google_cloud_run_v2_service.this.name == "ikaro-backend"
    error_message = "Service should plan cleanly when max_instance_count * db_pool_size stays within 80% of the tier's max_connections (6 * 3 = 18 <= 20)."
  }
}

run "max_instances_20_on_f1_micro_fails" {
  command = plan

  variables {
    db_tier            = "db-f1-micro"
    max_instance_count = 20
  }

  expect_failures = [
    var.max_instance_count,
  ]
}

run "unrecognized_tier_fails_instead_of_silently_skipping" {
  command = plan

  variables {
    db_tier            = "db-custom-2-8192"
    max_instance_count = 2
  }

  expect_failures = [
    var.max_instance_count,
  ]
}

run "bff_and_web_instantiations_are_unconstrained_when_db_pool_size_is_unset" {
  command = plan

  variables {
    db_pool_size       = null
    db_tier            = null
    max_instance_count = 999999
  }

  assert {
    condition     = google_cloud_run_v2_service.this.name == "ikaro-backend"
    error_message = "Non-backend instantiations (db_pool_size left null) must not be constrained by the backend-only connection-math invariant."
  }
}
