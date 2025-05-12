// src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
  StrategyOptionsWithoutRequest,
} from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super(<StrategyOptionsWithoutRequest>{
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 発行時と検証時で同じ SECRET を参照
      secretOrKey: config.get<string>(
        'JWT_ACCESS_SECRET',
        'default_jwt_secret_key',
      ),
    });
  }

  async validate(payload: any) {
    // validate が返すオブジェクトが req.user にセットされます
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}