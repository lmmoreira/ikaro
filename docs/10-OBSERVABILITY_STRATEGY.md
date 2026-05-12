# Observability Strategy - BeloAuto

## Overview

Observability is essential for maintaining a multi-tenant SaaS. We need to know not just *if* the system is working, but *how* it's working for each tenant. BeloAuto follows the **OpenTelemetry** standard for high-cardinality, high-dimensional telemetry data.

---

## The Four Pillars of Observability

### 1. **Structured Logging**
- **Format:** JSON (Standardized for machine parsing).
- **Mandatory Context:**
  - `tenant_id`: To filter logs per car wash company.
  - `user_id`: To identify the actor.
  - `request_id`: For request correlation.
  - `correlation_id`: To track events across bounded contexts.
- **Level Management:** 
  - `ERROR`: System failures, unexpected exceptions.
  - `WARN`: Business rule violations (e.g., cancellation < 48h).
  - `INFO`: Significant lifecycle events (Booking Created, Approved).
  - `DEBUG`: Internal state (disabled in production).

### 2. **Distributed Tracing**
- **Standard:** OpenTelemetry (OTel).
- **Trace Path:** Frontend → BFF → Backend → Event Bus → Consumer.
- **Goal:** Visualize the latency and path of a single request across all microservices/contexts.
- **Key Spans:** Database queries, Event publication, External API calls (Google OAuth, Email).

### 3. **Metrics & Dashboards**
- **System Metrics:** CPU, Memory, Disk, Network latency for the NestJS/React containers.
- **Business Metrics (SLAs/SLOs):**
  - **Availability:** % of uptime for the public hotsite (Tenant Discovery).
  - **Booking Latency:** P99 for `UC-001` (Guest Booking Request) submission.
  - **Loyalty Sync:** Time between `BookingCompleted` event and the resulting `LoyaltyEntry` insert.
  - **Throughput:** Number of bookings per hour across all tenants.
- **Tenant Metrics:** 
  - Active bookings per tenant (identifying "Heavy Tenants").
  - GCS Storage usage (Photos) per tenant.
  - Email failure rate per tenant (identifying SMTP issues).

### 4. **Health Checks**
- **Liveness:** Is the process running?
- **Readiness:** Is the database connected? Is the event bus accessible?
- **Startup:** Has the initial configuration loaded?

---

## Observability for Multi-Tenancy

Every piece of telemetry **MUST** include the `tenant_id`. This allows us to:
- Identify if a specific car wash is experiencing issues while others are fine.
- Monitor resource usage per tenant for future billing/scaling.
- Provide a "Status Page" that can be filtered per company.

---

## Error Tracking & Alerting

### **Error Tracking (e.g., Sentry)**
- Automatically capture uncaught exceptions.
- Group errors by fingerprint.
- Link to the specific line of code and the request context.

### **Alerting Rules**
- **Critical:** P99 latency > 2s for 5 minutes.
- **Critical:** Success rate < 95% for 10 minutes.
- **Warning:** Disk usage > 80%.
- **Notification:** Slack/Discord channel for dev team.

---

## Tenant-Specific Monitoring

We will build dashboards that allow us to zoom in on a specific tenant:
- **Tenant Dashboard:**
  - Booking volume.
  - Email notification success rate.
  - Photo upload latency.
  - Audit log activity.

---

## Audit Trail

While logging is for developers, the **Audit Trail** is a business requirement (see `01-BUSINESS_CONTEXT.md`).
- **Store in DB:** Significant actions (Booking Status Changes, User Logins).
- **Immutable:** Records cannot be deleted or modified.
- **Searchable:** Admins can see "Who did what and when".

---

## Tech Stack (Standardized)

To ensure **No Vendor Lock-in** and a professional, cloud-agnostic footprint, BeloAuto mandates the following stack:

- **Metrics:** **Prometheus** (Standard for scraping metrics).
- **Visualization:** **Grafana** (Dashboards for system and business metrics).
- **Distributed Tracing:** **OpenTelemetry (OTel)** (Industry standard for tracing).
- **Logging:** **Loki** or standard JSON logs to `stdout` for container-level collection.
- **Agent:** **OpenTelemetry Collector** (The single point of collection for all telemetry).

---

## Implementation Rules for Developers

1. **Structured Logs:** Use the internal `Logger` service to output JSON to `stdout`. Include `tenant_id` and `correlation_id` in every log.
2. **Prometheus Metrics:** Export standard metrics (HTTP request count, duration) and custom business metrics (bookings per tenant).
3. **OTel Tracing:** Every use case should start a span. Traces must correlate requests from the BFF to the Backend and through the Internal Event Bus.
4. **Health Checks:** Every container must provide `/health/live` and `/health/ready` for Docker/K8s orchestrators.

---

**Status:** Phase 2 - Technical Architecture  
**Next:** `11-ARCHITECTURE.md` (System Diagram & Hexagonal Deep Dive)
