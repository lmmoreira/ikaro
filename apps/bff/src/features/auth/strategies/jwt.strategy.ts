import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload } from '../../../shared/decorators/current-user.decorator';

const SESSION_COOKIE_REGEX = new RegExp(String.raw`(?:^|;\s*)${SESSION_COOKIE_NAME}=([^;]+)`);

function extractFromCookie(req: Request): string | null {
  const raw = req?.headers?.cookie ?? '';
  const match = SESSION_COOKIE_REGEX.exec(raw);
  return match ? decodeURIComponent(match[1]) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractFromCookie,
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  validate(payload: CurrentUserPayload): CurrentUserPayload {
    return payload;
  }
}
