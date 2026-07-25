variable "cloud_run_invokers" {
  description = "Cloud Run services and principals receiving the run.invoker role."
  type = map(object({
    service_name = string
    member       = string
  }))
}

variable "cloud_run_public_invokers" {
  description = "Cloud Run services receiving the deliberately public allUsers invoker grant."
  type        = set(string)
}

variable "project_id" {
  description = "GCP project that owns the workload IAM policies."
  type        = string
}

variable "pubsub_subscription_members" {
  description = "Pub/Sub subscription IAM bindings keyed by stable semantic name."
  type = map(object({
    subscription = string
    role         = string
    member       = string
  }))
}

variable "pubsub_topic_members" {
  description = "Pub/Sub topic IAM bindings keyed by stable semantic name."
  type = map(object({
    topic  = string
    role   = string
    member = string
  }))
}

variable "service_account_members" {
  description = "Service-account IAM bindings keyed by stable semantic name."
  type = map(object({
    service_account_id = string
    role               = string
    member             = string
  }))
}

variable "region" {
  description = "GCP region of the Cloud Run services."
  type        = string
}
