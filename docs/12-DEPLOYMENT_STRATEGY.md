# Deployment Strategy - BeloAuto

## Overview

BeloAuto follows a **"Simple but Robust"** deployment philosophy. We prioritize **No Vendor Lock-in** by using standardized Docker artifacts, but we leverage **Managed Container Platforms** to provide professional horizontal scaling and self-healing without the operational complexity of Kubernetes.

---

## The "Same Image" Guarantee

To ensure absolute reliability, BeloAuto uses the **Immutable Artifact** pattern:
- **Build Once:** GitHub Actions builds a Docker image on every push to `main`.
- **Verify Always:** That *exact* image is scanned by SonarQube and passes Integration Tests.
- **Deploy Anywhere:** The same image is pulled by Production. Configuration is injected at runtime via Environment Variables.

---

## Production Architecture: Managed Container Platform

We avoid managing virtual machines (VPS) or complex clusters (K8s). Instead, we use managed services like **AWS Fargate** or **GCP Cloud Run**.

### **1. Compute Layer (Stateless)**
- **Artifacts:** `beloauto-backend`, `beloauto-bff`.
- **Scaling:** Horizontal. We can run multiple **replicas** of each container.
- **Traffic:** Managed Load Balancer (ALB on AWS / Global LB on GCP) handles traffic distribution and SSL termination.
- **Robustness:** If a container crashes, the platform automatically restarts a new one.

### **2. Storage & State (Managed)**
- **Database:** Standard **PostgreSQL** via a managed service (AWS RDS / GCP Cloud SQL).
- **Files/Photos:** S3-compatible storage (AWS S3 / GCP GCS) via a standard adapter.
- **Portability:** Because we use standard SQL and S3 protocols, moving clouds is just a connection string update.

### **3. Observability (Self-Hosted Containers)**
- **Prometheus & Grafana:** Deployed as containers on the same managed platform.
- **Persistence:** Connected to a managed volume (AWS EFS / GCP Filestore) to ensure metrics/logs survive container restarts.
- **Independence:** By running our own Prometheus/Grafana rather than using cloud-specific tools (CloudWatch/Stackdriver), we maintain **zero vendor lock-in**.

---

## Deployment Workflow (CD)

1.  **CI Success:** GitHub Actions pushes the verified image to the Registry (e.g., GitHub Packages or Docker Hub).
2.  **Pre-Deploy:** A specialized "Migration Task" runs the latest database migrations.
3.  **Deployment:** The managed platform performs a **Rolling Update**:
    - Starts the new version replicas.
    - Performs Health Checks (`/health/ready`).
    - Redirects traffic to the new version.
    - Shuts down the old version.
4.  **Security:** All containers run as non-root users. Secrets are injected from a Secret Manager (not stored in the code or image).

---

## Local Development Parity

Developers use **Docker Compose** locally. This mimics the production environment (Backend, DB, Prometheus, Grafana) on a single machine, ensuring "it works on my machine" translates to "it works in production."

---

**Status:** Phase 2 - Technical Architecture  
**Next:** `13-DATABASE_SCHEMA.md`
