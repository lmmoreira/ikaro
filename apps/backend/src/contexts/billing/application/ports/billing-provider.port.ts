import type {
  AutoBillingMode,
  NormalizedChargeStatus,
  NormalizedProviderEvent,
  ProviderAccountHealth,
} from '../../domain/provider-events';

export const BILLING_PROVIDER_REGISTRY = Symbol('BillingProviderRegistry');

export interface ProviderCustomerIdentity {
  readonly name: string;
  readonly email: string;
  /** Asaas enforces the CPF/CNPJ when a charge is created, so it is sent at customer creation. */
  readonly taxId: string | null;
  readonly countryCode: string;
}

export interface ProviderChargeLine {
  readonly description: string;
  readonly amountMinor: number;
}

export interface ProviderCustomerLocation {
  readonly countryCode: string;
  readonly postalCode?: string;
  readonly state?: string;
}

export interface CreateProviderChargeInput {
  readonly merchantProfileKey: string;
  readonly providerCustomerId: string;
  /** `YYYY-MM-DD`, a calendar day. */
  readonly dueDate: string;
  readonly lines: readonly ProviderChargeLine[];
  readonly currency: string;
  readonly taxBehavior: 'INCLUSIVE' | 'EXCLUSIVE';
  readonly customerLocation: ProviderCustomerLocation;
  readonly description: string;
  /**
   * Our charge id: at most 100 characters (Asaas), echoed back in the provider's webhooks. It is
   * also the retry key: `createCharge` called again with the same value returns the charge it
   * already created. Asaas does not enforce that on `externalReference` itself, so its adapter
   * sends the same value as the `Idempotency-Key` header and, on the 409, looks the charge up.
   */
  readonly externalReference: string;
  /** The web billing page the hosted payment page returns to. */
  readonly returnUrl: string;
}

export interface ProviderPaymentLink {
  readonly paymentUrl: string;
  readonly expiresAt: Date;
}

export interface ProviderTaxBreakdown {
  readonly totalTaxMinor: number;
  readonly lines: readonly ProviderChargeLine[];
  readonly providerCalculationId?: string;
}

export interface CreatedProviderCharge extends ProviderPaymentLink {
  readonly providerChargeId: string;
  readonly totalMinor: number;
  /** Empty while every price is tax-inclusive (BR); the Stripe adapter fills it. */
  readonly tax: ProviderTaxBreakdown;
}

export type WebhookHeaders = Readonly<Record<string, string | undefined>>;

/**
 * The single seam to payment providers, in Ikaro's terms; no provider type leaks past an adapter.
 * Every method that crosses the network is registered in `externalSideEffectPorts`, so none may be
 * called inside `txManager.run()`. `parseWebhook` is local and is not registered.
 */
export interface BillingProviderPort {
  ensureCustomer(
    tenantId: string,
    identity: ProviderCustomerIdentity,
  ): Promise<{ providerCustomerId: string }>;
  createCharge(input: CreateProviderChargeInput): Promise<CreatedProviderCharge>;
  regeneratePaymentLink(providerChargeId: string): Promise<ProviderPaymentLink>;
  /** Throws `ChargeAlreadyPaidError` when the provider refuses because the charge was just paid. */
  cancelCharge(providerChargeId: string): Promise<void>;
  startAutoBilling(
    providerCustomerId: string,
    mode: AutoBillingMode,
  ): Promise<{ authorizationUrl: string }>;
  revokeAutoBilling(providerCustomerId: string): Promise<void>;
  fetchChargeStatus(providerChargeId: string): Promise<NormalizedChargeStatus>;
  readAccountHealth(merchantProfileKey: string): Promise<ProviderAccountHealth>;
  reenableWebhookQueue(merchantProfileKey: string): Promise<void>;
  /**
   * Normalises an inbound webhook body: local, no network, stateless. It does not authenticate the
   * request (the Asaas token check is the BFF's; a Stripe adapter verifies its signature here).
   * Throws `InvalidProviderWebhookError` for a body it cannot read.
   */
  parseWebhook(rawBody: string, headers: WebhookHeaders): NormalizedProviderEvent;
}

/**
 * The provider is a property of a subscription's `merchantProfileKey`, so a single DI token cannot
 * select it. Every use case injects the registry, never a bare `BillingProviderPort` token.
 */
export interface BillingProviderRegistryPort {
  /** Throws `MerchantProfileKeyNotAllowedError` or `ProviderNotSupportedError`. */
  resolve(merchantProfileKey: string): BillingProviderPort;
}
