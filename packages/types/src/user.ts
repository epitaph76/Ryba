export type UserId = string;

export interface UserRecord {
  id: UserId;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}
