import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SelectionTokenService } from './selection-token.service';

describe('SelectionTokenService', () => {
  let service: SelectionTokenService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({
      secret: 'test-secret-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    service = new SelectionTokenService(jwtService);
  });

  it('issues a token that decodes to the correct googleOAuthId', () => {
    const token = service.issueSelectionToken('google-sub-123');

    const { googleOAuthId } = service.verifySelectionToken(token);

    expect(googleOAuthId).toBe('google-sub-123');
  });

  it('throws BadRequestException for a tampered token', () => {
    expect(() => service.verifySelectionToken('this.is.not.valid')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a token signed with the wrong secret', () => {
    const otherJwt = new JwtService({
      secret: 'other-secret-64-chars-long-yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
    });
    const badToken = otherJwt.sign({ googleOAuthId: 'sub', type: 'selection' });

    expect(() => service.verifySelectionToken(badToken)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a token of the wrong type', () => {
    const accessToken = jwtService.sign({
      sub: 'id',
      tenantId: 't',
      tenantSlug: 's',
      role: 'CUSTOMER',
    });

    expect(() => service.verifySelectionToken(accessToken)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for an expired selection token', () => {
    // expiresIn: -1 sets exp = now - 1s, so the token is immediately expired
    const expiredToken = jwtService.sign(
      { googleOAuthId: 'google-sub-123', type: 'selection' },
      { expiresIn: -1 },
    );

    expect(() => service.verifySelectionToken(expiredToken)).toThrow(BadRequestException);
  });
});
