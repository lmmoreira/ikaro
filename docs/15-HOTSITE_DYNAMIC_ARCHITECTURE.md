# Hotsite Dynamic Architecture - BeloAuto

## Overview

BeloAuto provides each car wash (tenant) with a professional, high-conversion hotsite. To support unique visual identities and varied content needs (galleries, testimonials, simplified booking) while maintaining a single codebase, we use a **Server-Driven Hotsite Manifest** strategy.

---

## 1. The Hotsite Manifest Pattern

Instead of creating separate frontend projects or hardcoded pages for each tenant, the React frontend is a **Rendering Engine**. It fetches a "Manifest" from the BFF that describes *what* to show and *how* it should look.

### **The Manifest Schema (Conceptual)**
```json
{
  "tenant": {
    "name": "AutoWash Pro",
    "slug": "autowash-pro"
  },
  "branding": {
    "primaryColor": "#2563eb",
    "secondaryColor": "#f8fafc",
    "fontFamily": "Inter, sans-serif",
    "logoUrl": "https://storage.../logo.png"
  },
  "layout": [
    { "type": "HERO", "data": { "title": "Premium Car Care", "image": "..." } },
    { "type": "SERVICE_LIST", "data": { "showPrices": true, "showPoints": true } },
    { "type": "GALLERY", "data": { "title": "Our Best Work", "limit": 6 } },
    { "type": "TESTIMONIALS", "data": { "items": [...] } },
    { "type": "BOOKING_FORM", "data": { "simplified": false } }
  ]
}
```

---

## 2. Visual Identity Implementation

To ensure professional results without custom CSS for every tenant, we use **CSS Custom Properties (Variables)**.

1. **Injection:** When the React app loads a tenant's hotsite, it injects the `branding` colors into the root element:
   ```javascript
   document.documentElement.style.setProperty('--primary-color', manifest.branding.primaryColor);
   ```
2. **Theming:** All modules (buttons, borders, icons) use `var(--primary-color)`. This ensures a cohesive "Visual Identity" across the entire site instantly.

---

## 3. Modular Frontend Architecture

The React app contains a library of **Core Modules**. Each module is a professional, responsive component:

| Module | Purpose | Content Source |
|--------|---------|----------------|
| **Hero** | First impression, CTA | Hotsite Manifest |
| **ServiceList**| Showcase services | Booking Context (Real-time) |
| **Gallery** | Before/after photos | Booking Context (Completed washes) |
| **Testimonials**| Social proof | Hotsite Manifest |
| **BookingForm**| The core action | Booking Context (Availability) |
| **Footer** | Contact, social links | Tenant Settings |

---

## 4. Local Development Workflow

To simulate different tenants locally:

1. **URL-based Routing:** Navigate to `http://localhost:3000/:slug`.
2. **Slug Detection:** The React app parses the URL path to get the `slug`.
3. **Data Fetching:**
   - `GET /v1/tenants/slug/:slug` (Fetches the Manifest).
   - Use the `slug` in the `X-Tenant-Slug` header for all subsequent API calls (Availability, Services).
4. **Mocking:** For testing, we can provide different manifest JSONs to see how the "Rendering Engine" behaves.

---

## 5. Deployment & Pipeline

1. **Single Artifact:** We build and deploy **ONE** frontend container (`beloauto-frontend`).
2. **Global Reach:** The same container serves `beloauto.com/tenant-a` and `beloauto.com/tenant-b`.
3. **Cache Strategy:**
   - The frontend bundle is cached globally (CDN).
   - The Hotsite Manifest has a short TTL (e.g., 5 mins) to allow admins to update their hotsite without a new deployment.
4. **Custom Domains (Future):**
   - A reverse proxy (Nginx or Cloud Run Custom Domains) maps `autowashpro.com` to `beloauto.com/autowash-pro`.
   - The frontend detects the domain and treats it as a slug.

---

## 6. Benefits for Non-Frontend Specialists

- **Consistency:** All hotsites follow professional design standards.
- **Maintenance:** A bug fix in the `BookingForm` module automatically repairs all 100+ tenant hotsites.
- **Speed:** New tenants go live instantly by just filling out a JSON form in the Admin Dashboard (no code, no build).
- **Flexibility:** Tenants can "drag and drop" modules (in the future Admin UI) to reorganize their site.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Matches Multi-Tenancy Strategy & Business Context.
