import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { sign } from 'jsonwebtoken';
import type { z } from 'zod';
import { loginRequestSchema, registerRequestSchema } from '@ryba/schemas';
import type { AuthSession, UserRecord } from '@ryba/types';

import { apiEnvironment } from '../app.config';
import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toUserRecord } from '../db/mappers';
import { users } from '../db/schema';

type RegisterRequest = z.infer<typeof registerRequestSchema>;
type LoginRequest = z.infer<typeof loginRequestSchema>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
  ) {}

  async register(payload: RegisterRequest): Promise<AuthSession> {
    const db = this.getDb();
    const email = payload.email.trim().toLowerCase();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'User with this email already exists');
    }

    const passwordHash = await hash(payload.password, 12);
    const id = randomUUID();

    const [insertedUser] = await db
      .insert(users)
      .values({
        id,
        email,
        displayName: payload.displayName ?? null,
        passwordHash,
      })
      .returning();

    return this.createSession(insertedUser);
  }

  async login(payload: LoginRequest): Promise<AuthSession> {
    const db = this.getDb();
    const email = payload.email.trim().toLowerCase();

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const passwordMatches = await compare(payload.password, user.passwordHash);

    if (!passwordMatches) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid credentials');
    }

    return this.createSession(user);
  }

  async me(userId: string): Promise<UserRecord> {
    const db = this.getDb();

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'User account is not available');
    }

    return toUserRecord(user);
  }

  private createSession(user: typeof users.$inferSelect): AuthSession {
    const token = sign(
      {
        sub: user.id,
        email: user.email,
      },
      apiEnvironment.JWT_SECRET,
      {
        expiresIn: apiEnvironment.JWT_EXPIRES_IN_SECONDS,
      },
    );

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: apiEnvironment.JWT_EXPIRES_IN_SECONDS,
      user: toUserRecord(user),
    };
  }

  private getDb() {
    const db = this.databaseService.db;

    if (!db) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'Database is not configured',
      );
    }

    return db;
  }
}
