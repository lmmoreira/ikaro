import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface SelectionTokenPayload {
  googleOAuthId: string;
  type: 'selection';
}

@Injectable()
export class SelectionTokenService {
  constructor(private readonly jwt: JwtService) {}

  issueSelectionToken(googleOAuthId: string): string {
    return this.jwt.sign({ googleOAuthId, type: 'selection' }, { expiresIn: '5m' });
  }

  verifySelectionToken(token: string): { googleOAuthId: string } {
    try {
      const payload = this.jwt.verify<SelectionTokenPayload>(token);
      if (payload.type !== 'selection') {
        throw new Error('Not a selection token');
      }
      return { googleOAuthId: payload.googleOAuthId };
    } catch {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'Selection token is invalid or expired',
      });
    }
  }
}
