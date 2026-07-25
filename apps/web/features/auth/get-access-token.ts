import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './session-cookie';

export async function getAccessToken(): Promise<string> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? '';
}
