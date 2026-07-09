const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import { GoogleOidcTokenVerifier } from './google-oidc-token-verifier.adapter';

describe('GoogleOidcTokenVerifier', () => {
  let verifier: GoogleOidcTokenVerifier;

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new GoogleOidcTokenVerifier();
  });

  it('calls verifyIdToken with the given token and audience', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        email: 'sa@project.iam.gserviceaccount.com',
        email_verified: true,
      }),
    });

    await verifier.verify('the-token', 'https://backend.internal/pubsub/push');

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'the-token',
      audience: 'https://backend.internal/pubsub/push',
    });
  });

  it('returns iss/email/email_verified from the verified payload', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        email: 'sa@project.iam.gserviceaccount.com',
        email_verified: true,
      }),
    });

    const payload = await verifier.verify('token', 'aud');

    expect(payload).toEqual({
      iss: 'https://accounts.google.com',
      email: 'sa@project.iam.gserviceaccount.com',
      email_verified: true,
    });
  });

  it('throws when the ticket has an empty payload', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => undefined });

    await expect(verifier.verify('token', 'aud')).rejects.toThrow(
      'OIDC token verification returned an empty payload',
    );
  });

  it('propagates rejection when verifyIdToken itself fails (bad signature, expired, wrong aud)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token used too late'));

    await expect(verifier.verify('token', 'aud')).rejects.toThrow('Token used too late');
  });
});
