import type { UserRecord } from './user';

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserRecord;
}
