import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { notFoundHtml } from '@/lib/not-found-response';
import { isVisibleArticle } from '@/lib/public-content-guard';
import { articleKindFromSegment } from '@/lib/routes';

/*
 * Content Security Policy strategy.
 *
 * Next.js emits inline bootstrap and RSC payload scripts. A policy with only
 * `script-src 'self'` blocks them and breaks hydration, including the admin
 * panel. Two policies are applied instead:
 *
 * - Public routes: inline scripts are allowed because the rendered content is
 *   fully controlled and sanitized (no user-generated HTML). This keeps pages
 *   cacheable and avoids forcing dynamic rendering.
 * - /admin routes: a per-request nonce is generated and handed to Next.js via
 *   the request CSP header. The panel is already dynamic (it reads the session
 *   cookie), so the nonce has no caching cost.
 *
 * Hash-based public CSP remains a future validation item (see
 * docs/11-seguridad-hardening.md).
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const imageSources = [
  "'self'",
  'data:',
  'https://*.public.blob.vercel-storage.com',
  'https://*.vercel-storage.com',
];
if (process.env.IMAGES_PUBLIC_BASE_URL) imageSources.push(process.env.IMAGES_PUBLIC_BASE_URL);

const scriptSources = ["'self'", "'unsafe-inline'"];
const connectSources = ["'self'"];
if (isDevelopment) {
  scriptSources.push("'unsafe-eval'");
  connectSources.push('ws:');
}

const PUBLIC_CSP = [
  "default-src 'self'",
  `script-src ${scriptSources.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imageSources.join(' ')}`,
  "font-src 'self'",
  `connect-src ${connectSources.join(' ')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function adminCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const RESERVED_SEGMENTS = new Set([
  'admin',
  'api',
  '_next',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
]);

type PublicContentTarget = { kind: string; slug?: string };

/**
 * Identifies public content paths that the App Router would answer with a
 * streamed 200 when the content does not exist.
 *
 * Only one or two segment paths are considered: collections and articles.
 * Anything else is either a reserved route or a path without a matching route,
 * which Next.js already answers with a 404.
 */
function publicContentTarget(pathname: string): PublicContentTarget | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;
  if (RESERVED_SEGMENTS.has(segments[0])) return null;
  if (segments[0].includes('.')) return null;
  return segments.length === 1 ? { kind: segments[0] } : { kind: segments[0], slug: segments[1] };
}

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function notFoundResponse(): NextResponse {
  return new NextResponse(notFoundHtml(), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': PUBLIC_CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith('/admin')) {
    const target = publicContentTarget(pathname);
    if (target) {
      const kind = articleKindFromSegment(target.kind);
      if (!kind) return notFoundResponse();
      if (target.slug) {
        const visible = await isVisibleArticle(kind, decodeSlug(target.slug));
        if (!visible) return notFoundResponse();
      }
    }

    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', PUBLIC_CSP);
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = adminCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Without a session cookie the panel cannot render. Answering here keeps a
  // real redirect status instead of a streamed 200 with the redirect payload.
  if (pathname !== '/admin/login' && !request.cookies.has('session')) {
    const target = request.nextUrl.clone();
    target.pathname = '/admin/login';
    const redirect = NextResponse.redirect(target, 307);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Apply the policy to document responses. Static assets do not need a CSP
     * and skipping them avoids unnecessary function invocations.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
