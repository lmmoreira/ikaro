# TD03: Standardize Cross-Context Communication Pattern (Use Case Strictness)

## Status
- **Type**: Technical Debt / Architectural Consistency
- **Priority**: High
- **Context**: Backend (NestJS)
- **Created**: 2026-06-08

---

## User Story

**As a** backend developer,
**I want to** enforce a strict pattern where all cross-context communication happens exclusively through **Use Cases**,
**So that** I have a single, formal, and secure entry point for every inter-module interaction, ensuring that domain logic and authorization are always respected.

---

## Technical Context

Currently, the communication between Bounded Contexts (e.g., `notification` accessing `customer`) uses a Port-Adapter pattern, but the internal implementation of these adapters is inconsistent:
- **Direct Database Access**: Some adapters query another context's `DataSource` or `Repository` directly (High Debt).
- **Query Services**: Some use read-only `QueryServices`.
- **Use Cases**: Only a few use formal `UseCases`.

**Architectural Decision**: All Adapters MUST be converted to call dedicated **Use Cases** in the target context. Direct access to `Repositories`, `DataSources`, or `QueryServices` from outside their parent context is prohibited.

### The "Standardized Pattern" Definition

For any communication where **Context A** (Source) needs data/actions from **Context B** (Target):

1.  **Port Interface**: `I[ContextA][EntityFromContextB]Port`
    *   *Example*: `IPlatformBookingPort` (Located in Context A)
2.  **Port File**: `[context-a]-[entity-from-b].port.ts`
3.  **Adapter Class**: `[ContextA][EntityFromB]Adapter`
    *   *Example*: `PlatformBookingAdapter` (Located in Context A)
4.  **Target Use Case**: `Get[Entity]...UseCase` (Located in Context B)
    *   The adapter **MUST** inject this Use Case and nothing else.

---

## Refactoring Impact & Transformation Map

### 1. Platform -> Booking
- **Current**: `BookingLookupAdapter` -> `BookingQueryService`
- **Refactor**: Create `GetBookingSummaryUseCase` in `booking` context. Update `PlatformBookingAdapter` to call it.

### 2. Notification -> Multiple Targets
- **Customer**: `CustomerInfoAdapter` -> `CustomerQueryService`
    - **Refactor**: Create `GetCustomerInfoUseCase` in `customer` context.
- **Booking (Services)**: `ServiceInfoAdapter` -> `DataSource` (Direct SQL)
    - **Refactor**: Create `GetServicesByIdsUseCase` in `booking` context.
- **Staff**: `StaffInfoAdapter` -> `GetStaffByIdUseCase` (Correct) & `StaffQueryService`
    - **Refactor**: Move manager listing logic into a new `GetManagersByTenantUseCase`.
- **Platform (Tenant)**: `TenantInfoAdapter` -> `GetTenantByIdUseCase` (Correct).

### 3. Booking -> Multiple Targets
- **Customer**: `CustomerProfileAdapter` -> `CustomerQueryService`
    - **Refactor**: Use `GetCustomerProfileUseCase` (to be created in `customer`).
- **Platform**: `ReminderTenantAdapter` -> `DataSource` (Direct SQL)
    - **Refactor**: Create `ListActiveTenantsUseCase` in `platform` context.
- **Platform (Settings)**: `ScheduleTenantSettingsAdapter` -> `GetTenantByIdUseCase` (Correct).

### 4. Loyalty -> Multiple Targets
- **Booking**: `ServiceCatalogAdapter` -> `DataSource` (Direct SQL)
    - **Refactor**: Reuse `GetServicesByIdsUseCase` from `booking`.
- **Platform**: `LoyaltyTenantSettingsAdapter` -> `GetTenantByIdUseCase` (Correct).

---

## Detailed Implementation Plan (6 Steps)

### Step 1: Create Missing Use Cases
In the **Target Contexts**, identify all "Shortcut" queries and wrap them in formal Use Cases.
- *Example*: In `booking`, create `application/use-cases/get-services-by-ids.use-case.ts`.
- Ensure these Use Cases return **DTOs** or **Domain Aggregates**, never raw database entities.

### Step 2: Port & Symbol Migration
- Rename port files in `application/ports/` to `[current]-[target].port.ts`.
- Update the `Symbol` name to `[CURRENT]_[TARGET]_PORT`.
- Update the interface name to `I[Current][Target]Port`.

### Step 3: Adapter Refactoring & Relocation
- Move all cross-context adapters to `infrastructure/cross-context/`.
- Rename class to `[Current][Target]Adapter`.
- **CRITICAL**: Remove `DataSource`, `Repository`, and `QueryService` injections. Inject only the corresponding `UseCase` from the target context.

### Step 4: Dependency Injection Cleanup
- Update the source context's NestJS Module (e.g., `notification.module.ts`).
- Ensure target Use Cases are exported by their parent module and imported by the source module.
- Update the `@Inject()` decorators in all Application Services that use these ports.

### Step 5: Test Migration & Validation Suite
The refactoring is not complete until the entire test pyramid is updated to reflect the new UseCase-based architecture.

1.  **Unit Tests (`.spec.ts`)**:
    - Rename all `[entity]-info.adapter.spec.ts` to `[current]-[target].adapter.spec.ts`.
    - Update `describe` blocks and class names in the tests.
    - **Mocks**: Change mocks from `QueryService` to the new `UseCase`. Since UseCases only have one `.execute()` method, the mock setup becomes simpler and more consistent.
2.  **Integration Tests (`.integration.spec.ts`)**:
    - Verify that tests in the Source Context (e.g., `notification`) can still successfully retrieve data from the Target Context (e.g., `booking`) through the new UseCase path.
    - Verify that NestJS `Test.createTestingModule` correctly includes the new UseCase providers.
3.  **In-Memory Port Mocks**:
    - Located in `apps/backend/src/test/infrastructure/`.
    - Rename and update classes like `InMemoryCustomerProfilePort` to `InMemoryBookingCustomerPort`.
    - These mocks must implement the new `IBookingCustomerPort` interface.

### Step 6: Cross-Context Entity Import Removal
- Audit all files and ensure that `apps/backend/src/contexts/A/...` never imports an **Entity** or **Repository** from `apps/backend/src/contexts/B/...`. All communication must stop at the **Application Layer (UseCase)**.

---

## Acceptance Criteria
- [x] All cross-context adapters are located in `infrastructure/cross-context/`.
- [x] Every adapter depends **exclusively** on one or more `UseCases` from the target context.
- [x] Zero usage of `DataSource` or `Repository` from context B inside context A.
- [x] All `.spec.ts` and `.integration.spec.ts` files for the affected adapters are updated and passing.
- [x] `apps/backend/src/test/infrastructure/` mocks are updated and consistent with new ports.
- [x] `pnpm build` passes with zero circular dependency warnings.

