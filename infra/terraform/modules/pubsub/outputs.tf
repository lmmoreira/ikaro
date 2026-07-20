# Outputs land with this module's resources (M17-S19):
# topic names — consumed by scheduler.

output "topic_ids" {
  description = "Map of event/trigger name -> full Pub/Sub topic resource id. Consumed by M17-S21 (Cloud Scheduler's pubsub_target.topic_name for the 4 cron topics)."
  value       = { for k, t in google_pubsub_topic.source : k => t.id }
}

output "topic_names" {
  description = "Map of event/trigger name -> the ikaro-<name> topic name (without the full resource path)."
  value       = { for k, t in google_pubsub_topic.source : k => t.name }
}
