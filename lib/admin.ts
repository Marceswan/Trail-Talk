import { HttpError, requireAccount } from './auth';

export async function requireAdmin() {
  const user = await requireAccount();
  if (user.role !== 'admin') throw new HttpError('Administrator access is required.', 403);
  return user;
}
