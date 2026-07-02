import { cookies } from 'next/headers';

export async function getAccessToken(): Promise<string> {
  return (await cookies()).get('access_token')?.value ?? '';
}
