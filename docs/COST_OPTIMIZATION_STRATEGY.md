# Cost Optimization Strategy (Lean Startup) - Ikaro

> **When to load:** weighing a tooling or infrastructure choice against cost: the lean-startup rules, estimated MVP costs, optimisation patterns and the scaling roadmap; the choices themselves are in `docs/TECH_STACK_DECISIONS.md`.
> **Tags:** product

## Overview

For a small startup, being **finance conscious** means maximizing the value of every dollar. Our strategy follows the **"Lean Professional"** approach: use free/low-cost SaaS to save time (the most expensive resource), and use pay-as-you-go infrastructure to minimize hosting waste.

---

## 1. The "Time vs. Money" Rule

**Self-hosting complex tools (like SonarQube) is often a "False Economy" for startups.**

- **Self-hosting SonarQube:** Requires a dedicated server (~$20/mo for 4GB RAM), manual updates, backups, and troubleshooting time.
- **SonarCloud (SaaS):** Free for open source, or ~$10/mo for small private projects. Zero maintenance.

**Decision:** Always prefer **SaaS Free Tiers** or **Low-Cost Managed Services** until the team is large enough to justify the maintenance cost of self-hosting.

---

## 2. Lean Tech Stack & Estimated Costs (MVP)

| Category | Recommended Tool | Cost (per month) | Why? |
|----------|------------------|------------------|------|
| **Source Control** | GitHub Free/Team | $0 - $4/user | Industry standard, excellent free tier. |
| **CI/CD** | GitHub Actions | $0 (Free minutes) | Generous free tier for private repos. |
| **Quality/Security**| SonarCloud + Snyk (weekly scan only) | $0 (Free tiers) | Use "SaaS" free versions first; Snyk runs weekly, not per PR, to stay inside its monthly test quota. |
| **Compute** | GCP Cloud Run | $0 - $10 | Scale-to-zero. Only pay when users are active. |
| **Database** | Managed Postgres (Small) | $15 - $30 | **Crucial:** Never self-host DB. Managed backups are worth the $15 premium. |
| **Email** | Brevo | $0 (Free tier) | High deliverability for free (up to 3k-10k emails/mo). |
| **Observability** | Google Cloud Trace, Logging and Monitoring, Managed Service for Prometheus | usage-based, ~$0 at MVP volume | No VM to run; no self-hosted Grafana or Prometheus exists (see `docs/OBSERVABILITY_STRATEGY.md`). |
| **Total MVP Cost** | | **~$20 - $50** | A professional, scalable SaaS for the price of a dinner. Indicative lean-startup range; the canonical, line-itemised launch cost of the committed GCP stack is `docs/TECH_STACK_DECISIONS.md` § COST SUMMARY (~$43/month). |

---

## 3. Infrastructure Optimization Patterns

### **A. Scale-to-Zero**
Use "Serverless Containers" (GCP Cloud Run). If no one is using the app at 3 AM, you pay $0 for compute.

### **B. Development Environments**
- **No permanent "Dev" server:** Developers run everything in **Docker locally**.
- **Ephemeral Staging (idea, not implemented):** Staging is a persistent Terraform environment today; spinning it up only while a PR is open was considered and not built.

### **C. Managed Database vs. VPS**
While a $5 VPS can run Postgres, a **Cloud SQL** instance (starting at ~$15) provides:
- Automated daily backups, plus Point-in-Time recovery where enabled (`enable_pitr`: off in staging, on in production).
- Automatic security patches.
- Managed availability (the instance is currently ZONAL — `infra/terraform/modules/database/main.tf` — no HA/regional failover is configured, so no HA SLA applies yet).
**Benefit:** Prevents a $50,000 loss from data corruption to save $10/month.

---

## 4. Quality vs. Cost Balance

**Don't compromise on these (They save money long-term):**
- **Automated Tests:** Preventing one critical bug in production saves days of "firefighting" time.
- **Tenant Isolation:** Preventing a data leak avoids legal costs and bankruptcy.
- **Clean Architecture:** Avoids "Technical Debt" which makes the app slower and more expensive to change later.

---

## 5. Cost Scaling Roadmap

1. **Seed (0-100 users):** Stay on free tiers and smallest managed instances (~$30/mo).
2. **Growth (100-1000 users):** Scale compute horizontally. Upgrade DB instance size (~$100/mo).
3. **Scale (1000+ users):** Consider committed-use (reserved) discounts to optimize high-volume costs. Observability is on managed GCP services; no self-hosted Grafana or Prometheus exists (see the Observability row above).

---

**Status:** Strategy reference — the committed infrastructure (GCP, M17) is in `docs/TECH_STACK_DECISIONS.md` and `docs/DEPLOYMENT_STRATEGY.md`  
**Validated:** Professional engineering standards at a startup-friendly price point.
