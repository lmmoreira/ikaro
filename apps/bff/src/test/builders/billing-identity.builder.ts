import type { BillingIdentityReadyResponse } from '@ikaro/types';

/** The backend's billing identity answer (and the BFF's public response: they share a shape). */
export class BillingIdentityBuilder {
  private identity: BillingIdentityReadyResponse = {
    provisioning: false,
    taxIdType: 'CNPJ',
    taxId: '11222333000181',
    legalName: 'Lavacar BH Ltda',
    billingEmail: 'cobranca@lavacar.test',
    address: {
      street: 'Rua das Flores',
      number: '100',
      complement: null,
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30130-110',
    },
  };

  empty(): this {
    this.identity = {
      provisioning: false,
      taxIdType: null,
      taxId: null,
      legalName: null,
      billingEmail: null,
      address: null,
    };
    return this;
  }

  build(): BillingIdentityReadyResponse {
    return structuredClone(this.identity);
  }
}
