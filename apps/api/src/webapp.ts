// Serves the built React app (apps/web/dist) from the same server as the API, so the browser sees ONE address.
// That matters: the refresh cookie is SameSite=Strict, which only works when the page and the API share an origin.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import helmet from 'helmet';

/** Where `npm run build -w @aravalli/web` puts the app. */
export const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

/**
 * index.html carries one small inline script (it sets the colour theme before the first paint, so there is no flash).
 * helmet's default security policy blocks inline scripts, so the policy names exactly that script by its hash: nothing else
 * inline is allowed to run.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    // a browser reads every line break as LF whatever the file uses (a Windows file has CRLF), and hashes what it read
    const text = m[1]!.replace(/\r\n?/g, '\n');
    hashes.push(`'sha256-${createHash('sha256').update(text).digest('base64')}'`);
  }
  return hashes;
}

/** Security headers for the whole app. In production they also allow the one inline theme script. */
export function securityHeaders(dist?: string) {
  const index = dist && join(dist, 'index.html');
  const hashes = index && existsSync(index) ? inlineScriptHashes(readFileSync(index, 'utf8')) : [];
  return helmet({
    contentSecurityPolicy: {
      directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'script-src': ["'self'", ...hashes] },
    },
  });
}

/** Static files, then index.html for every address that is not /api, so the React router can handle /risks, /incidents/INC-0001 and so on. */
export function serveWebApp(app: Express, dist: string = webDist): boolean {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) {
    console.warn(`Production mode, but ${index} does not exist. Build the web app first: npm run build -w @aravalli/web`);
    return false;
  }
  app.use(
    express.static(dist, {
      index: false,
      // files in /assets have the content hash in their name, so they never change: cache them for a year
      setHeaders: (res, path) => {
        if (path.includes(`${join(dist, 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return true;
}
