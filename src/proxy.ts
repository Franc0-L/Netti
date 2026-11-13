import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ArticleKind } from '@/lib/content';
import { notFoundHtml } from '@/lib/not-found-response';
import { isVisibleArticle, resolveRedirect } from '@/lib/public-content-guard';
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

/**
 * Public routes answered by the App Router.
 *
 * The catch-all `[kind]` segment would render them with a 200 and the
 * not-found view, so the proxy must let them through instead of turning them
 * into a 404.
 */
const APP_ROUTER_ROUTES = new Set(['juegos', 'buscar', 'terminos', 'privacidad']);

type PublicContentTarget = { kind: ArticleKind | null; slug?: string };

/**
 * Identifies public content paths that the App Router would answer with a
 * streamed 200 when the content does not exist.
 *
 * Only one or two segment paths are considered: collections and articles.
 * Anything else is either a reserved route, a route of the App Router
 * (`/juegos`, `/buscar`, `/terminos`, `/privacidad`) or a path without a
 * matching route, which Next.js already answers with a 404.
 */
function publicContentTarget(pathname: string): PublicContentTarget | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;
  if (RESERVED_SEGMENTS.has(segments[0])) return null;
  if (segments[0].includes('.')) return null;
  if (APP_ROUTER_ROUTES.has(segments[0])) return null;
  const kind = articleKindFromSegment(segments[0]);
  return segments.length === 1 ? { kind } : { kind, slug: segments[1] };
}

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function publicHeaders(headers: Headers): void {
  headers.set('Content-Security-Policy', PUBLIC_CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function notFoundResponse(): NextResponse {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  publicHeaders(headers);
  return new NextResponse(notFoundHtml(), { status: 404, headers });
}

function redirectResponse(
  request: NextRequest,
  target: { toPath: string; statusCode: number }
): NextResponse {
  const headers = new Headers({ 'Cache-Control': 'no-store, max-age=0' });
  publicHeaders(headers);
  return NextResponse.redirect(new URL(target.toPath, request.url), {
    status: target.statusCode,
    headers,
  });
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith('/admin')) {
    const target = publicContentTarget(pathname);
    if (target) {
      const kind = target.kind;
      if (!kind) return notFoundResponse();
      if (target.slug) {
        const visible = await isVisibleArticle(kind, decodeSlug(target.slug));
        if (!visible) {
          const fromPath = pathname.replace(/\/+$/, '') || '/';
          const redirect = await resolveRedirect(fromPath);
          if (redirect) return redirectResponse(request, redirect);
          return notFoundResponse();
        }
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
