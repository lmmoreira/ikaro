# Infrastructure & Tooling Map - BeloAuto

## Overview

This document clarifies where each tool and service in the BeloAuto ecosystem is hosted. We follow a hybrid model: using **SaaS (Software as a Service)** for developer tools to reduce operational overhead, while **Self-Hosting** our core application and observability stack to maintain control and avoid vendor lock-in.

---

## 1. Developer Tools (SaaS - Cloud Hosted)

These tools are hosted by their respective providers. We do not manage the servers, only the configuration.

| Tool | Provider | Role |
|------|----------|------|
| **GitHub** | GitHub (Microsoft) | Source Control, PR Management, Issue Tracking. |
| **GitHub Actions** | GitHub (Microsoft) | CI/CD Runners. Executed in GitHub's cloud. |
| **SonarCloud** | SonarSource | Static Analysis & Quality Gate (SaaS version of SonarQube). |
| **Snyk** | Snyk.io | Security Scanning (SCA) & Vulnerability Management. |
| **Google/AWS Auth** | Google/AWS | Google OAuth 2.0 Identity Provider. |

---

## 2. Project Infrastructure (Managed Platform)

The application and its direct dependencies are hosted on a **Managed Container Platform** (e.g., AWS Fargate, GCP Cloud Run, or Azure Container Apps).

| Component | Hosting Model | Purpose |
|-----------|---------------|---------|
| **BFF & Backend** | Containers | The application logic running in managed replicas. |
| **Web (React)** | CDN / Static Hosting | The compiled frontend bundle served via edge locations. |
| **PostgreSQL** | Managed DB (RDS/Cloud SQL) | Production data with automated backups and scaling. |
| **Artifact Registry** | Managed Registry | Secure storage for our private Docker images. |

---

## 3. Observability Stack (Self-Hosted Containers)

To maintain **Zero Vendor Lock-in**, we host our own observability tools as containers within our own infrastructure (not as SaaS).

| Tool | Hosting Model | Storage |
|------|---------------|---------|
| **Prometheus** | Container | Managed persistent volume for metrics. |
| **Grafana** | Container | Managed persistent volume for dashboards. |
| **OTel Collector** | Container | Stateless relay for traces and metrics. |
| **Loki** | Container | Managed volume for log aggregation. |

---

## 4. Local Development Environment

Everything needed to run the system is mirrored on the developer's machine using **Docker**.

- **App:** Node.js/NestJS and React (local processes or containers).
- **Dependencies:** PostgreSQL, GCP Pub/Sub Emulator, Prometheus, Grafana (local Docker containers).
- **Security:** Local scans (Gitleaks, Snyk CLI) are run before pushing to GitHub.

---

## 5. Security & Access Summary

- **Secrets:** Hosted in a **Managed Secret Manager**.
- **Connectivity:** All communication between the Web Layer and the BFF is over encrypted HTTPS.
- **Internal Traffic:** Communication between BFF and Backend/Database is kept within a Private Virtual Network (VPC).

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Clarifies hosting responsibilities across the stack.
