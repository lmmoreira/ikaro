import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffPublicFetch, bffServerFetch } from '@/shared/lib/api/bff-server';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

// Generous for this payload's actual shape (name/email/phone caps + up to 20 answers of up to
// 2000 chars each + a Turnstile token) but small enough to reject an attacker forcing this
// public, unauthenticated Route Handler to buffer an arbitrarily large body in memory before
// BFF/backend validation ever runs (Codex finding, PR #433 round 10).
const MAX_BODY_BYTES = 64 * 1024;

// A Content-Length header alone isn't trustworthy — it can be absent (chunked transfer) or
// simply wrong, and request.text() would still buffer whatever bytes actually arrive regardless
// of what the header claimed. Read the stream directly and abort as soon as the running byte
// count crosses the cap, so the limit holds even with no declared length at all (Codex finding,
// PR #433 round 11 — the round-10 Content-Length-only check left exactly this gap open).
async function readBodyWithLimit(request: NextRequest, maxBytes: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// The lead-form submission (UC-039/UC-040) optionally carries the logged-in customer's identity
// via Authorization: Bearer <jwt> (docs/14-API_CONTRACTS.md's decodeUserJwt() note) -- the JWT
// lives in an httpOnly cookie, unreadable by client JS, so LeadFormWidget.tsx cannot attach it
// with a direct bffClient call. This mirrors /api/bookings/attachments/signed-url/route.ts's
// exact branch: read the session cookie server-side, forward it as Authorization when present,
// fall back to an anonymous (guest) call otherwise.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ message: 'slug query param is required' }, { status: 400 });
  }

  const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (body === null) {
    return NextResponse.json({ message: 'Payload too large' }, { status: 413 });
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  try {
    const upstream = token
      ? await bffServerFetch(token, `/public/platform/lead-form/${slug}/submissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Tenant-Slug': slug,
          },
          body,
        })
      : await bffPublicFetch(`/public/platform/lead-form/${slug}/submissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Slug': slug,
          },
          body,
        });

    const contentType = upstream.headers.get('content-type') ?? '';
    const responseBody =
      contentType.includes('application/json') || contentType.includes('+json')
        ? await upstream.json()
        : { message: 'Upstream error' };

    return NextResponse.json(responseBody, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
