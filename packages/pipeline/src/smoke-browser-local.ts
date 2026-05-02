import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { and, eq, getDb } from '@creatorcanon/db';
import { closeDb } from '@creatorcanon/db/client';
import { hub, project } from '@creatorcanon/db/schema';
import { chromium, type Browser, type Page } from 'playwright';

import { loadDefaultEnvFiles } from './env-files';

const APP_URL = process.env.BROWSER_SMOKE_APP_URL ?? 'http://localhost:3000';
const WORKSPACE_ID = 'local-smoke-workspace';
const PROJECT_ID = 'local-smoke-project';
const HUB_SUBDOMAIN = 'local-smoke-knowledge-hub';
const HUB_PATH = `/h/${HUB_SUBDOMAIN}`;
const DETAIL_PATH = `${HUB_PATH}/overview`;
const OUTPUT_DIR = path.resolve(process.cwd(), '../../.local/browser-smoke');

type HubTheme = 'paper' | 'midnight' | 'field';

interface BrowserController {
  open(url: string): Promise<void>;
  setCookie(name: string, value: string, maxAge: number): Promise<void>;
  snapshot(label: string): Promise<string>;
  close(): Promise<void>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function includesText(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => undefined);
    return;
  }
  child.kill('SIGTERM');
}

function runCommand(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd ?? process.cwd(),
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForAppReady(): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const text = await fetchText(`${APP_URL}/healthcheck`);
    if (text != null) return true;
    await wait(500);
  }
  return false;
}

function startWebApp(): ChildProcess {
  const child = spawn('pnpm', ['--filter', '@creatorcanon/web', 'dev'], {
    cwd: path.resolve(process.cwd(), '../..'),
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[web] ${chunk.toString()}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[web] ${chunk.toString()}`);
  });

  return child;
}

async function ensureWebApp(): Promise<ChildProcess | undefined> {
  if (await waitForAppReady()) return undefined;
  const child = startWebApp();
  if (!(await waitForAppReady())) {
    await stopProcessTree(child);
    throw new Error(`Timed out waiting for local web app at ${APP_URL}.`);
  }
  return child;
}

async function createBrowserController(): Promise<BrowserController> {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  return {
    async open(url: string) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      assert(response, `No response received for ${url}.`);
      assert(response.status() < 400, `${url} returned HTTP ${response.status()}.`);
    },
    async setCookie(name: string, value: string, maxAge: number) {
      await page.context().addCookies([{
        name,
        value,
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + maxAge,
        sameSite: 'Lax',
      }]);
    },
    async snapshot(label: string) {
      const output = await page.locator('body').innerText();
      const html = await page.content();
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(path.join(OUTPUT_DIR, `${label}.txt`), output);
      await writeFile(path.join(OUTPUT_DIR, `${label}.html`), html);
      return output;
    },
    async close() {
      await browser.close();
    },
  };
}

async function assertRoute(pathname: string, expected: string[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${APP_URL}${pathname}`, {
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`${pathname} did not respond within 30s. ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  assert(
    response.status >= 200 && response.status < 400,
    `${pathname} returned HTTP ${response.status}.`,
  );
  const body = await response.text();
  for (const value of expected) {
    assert(body.includes(value), `${pathname} did not include expected text: ${value}`);
  }
}

async function setHubTheme(theme: HubTheme) {
  const db = getDb();
  const result = await db
    .update(hub)
    .set({ theme, updatedAt: new Date() })
    .where(and(eq(hub.subdomain, HUB_SUBDOMAIN), eq(hub.workspaceId, WORKSPACE_ID)))
    .returning({ id: hub.id });
  assert(result[0], `Could not find local smoke hub ${HUB_SUBDOMAIN}. Run pnpm smoke:local first.`);
}

async function assertSeededProject() {
  const db = getDb();
  const rows = await db
    .select({
      id: project.id,
      publishedHubId: project.publishedHubId,
    })
    .from(project)
    .where(and(eq(project.id, PROJECT_ID), eq(project.workspaceId, WORKSPACE_ID)))
    .limit(1);
  assert(rows[0]?.publishedHubId, 'Expected local smoke project to be published. Run pnpm smoke:local first.');
}

async function smokePublicTemplates(browser: BrowserController) {
  const cases: Array<{ theme: HubTheme; text: string }> = [
    { theme: 'paper', text: 'Creator Manual' },
    { theme: 'midnight', text: 'Operator Manual' },
    { theme: 'field', text: 'Studio Manual' },
  ];

  try {
    for (const item of cases) {
      await setHubTheme(item.theme);
      await assertRoute(HUB_PATH, [item.text, 'Well supported']);
      await assertRoute(DETAIL_PATH, ['Source moment', 'Well supported']);
      await browser.open(`${APP_URL}${HUB_PATH}`);
      const homeSnapshot = await browser.snapshot(`hub-${item.theme}-home`);
      assert(includesText(homeSnapshot, item.text), `Browser snapshot for ${item.theme} home missing ${item.text}.`);
      await browser.open(`${APP_URL}${DETAIL_PATH}`);
      const detailSnapshot = await browser.snapshot(`hub-${item.theme}-detail`);
      assert(
        includesText(detailSnapshot, 'Source moment'),
        `Browser snapshot for ${item.theme} detail missing Source moment.`,
      );
      assert(
        includesText(detailSnapshot, 'Well supported') || includesText(detailSnapshot, 'Limited support'),
        `Browser snapshot for ${item.theme} detail missing support label.`,
      );
    }
  } finally {
    await setHubTheme('midnight');
  }
}

async function signInDevUser(browser: BrowserController) {
  await browser.open(`${APP_URL}/sign-in`);
  const snapshot = await browser.snapshot('sign-in');
  assert(snapshot.includes('Continue as local dev user'), 'Sign-in page did not expose local dev auth bypass.');
  const response = await fetch(`${APP_URL}/api/dev/sign-in?token=1`);
  assert(response.ok, `Could not create local dev session token: HTTP ${response.status}.`);
  const body = await response.json() as { cookieName?: string; token?: string; maxAge?: number };
  assert(body.cookieName && body.token && body.maxAge, 'Local dev session token response was malformed.');
  await browser.setCookie(body.cookieName, body.token, body.maxAge);
  await wait(500);
}

async function smokeAuthedRoutes(browser: BrowserController) {
  const routes: Array<{ path: string; label: string; expected: string[] }> = [
    { path: '/app', label: 'app-dashboard', expected: ['Local Smoke Channel', 'Browse library'] },
    { path: '/app/library', label: 'app-library', expected: ['Source library', 'Operating an Alpha Pipeline'] },
    { path: '/app/projects/local-smoke-project', label: 'project-status', expected: ['Local Smoke Knowledge Hub'] },
    { path: '/app/projects/local-smoke-project/review', label: 'project-review', expected: ['Local Smoke Knowledge Hub'] },
    { path: '/app/projects/local-smoke-project/pages', label: 'project-pages', expected: ['Draft Pages'] },
    { path: '/admin/runs', label: 'admin-runs', expected: ['Admin'] },
    { path: '/admin/runs/local-smoke-run', label: 'admin-run-detail', expected: ['Admin Console'] },
  ];

  for (const route of routes) {
    await browser.open(`${APP_URL}${route.path}`);
    const snapshot = await browser.snapshot(route.label);
    for (const text of route.expected) {
      assert(includesText(snapshot, text), `${route.path} browser snapshot missing ${text}.`);
    }
  }
}

async function main() {
  loadDefaultEnvFiles();
  assert(process.env.DEV_AUTH_BYPASS_ENABLED === 'true', 'smoke:browser:local requires DEV_AUTH_BYPASS_ENABLED=true.');
  assert(process.env.ARTIFACT_STORAGE === 'local', 'smoke:browser:local only runs against local artifact storage.');
  assert(
    process.env.DATABASE_URL?.includes('localhost:54329'),
    'smoke:browser:local refuses to run unless DATABASE_URL points at local Docker Postgres on port 54329.',
  );

  await assertSeededProject();
  const webProcess = await ensureWebApp();
  const browser = await createBrowserController();

  try {
    await smokePublicTemplates(browser);
    await signInDevUser(browser);
    await smokeAuthedRoutes(browser);
  } finally {
    await browser.close();
    if (webProcess) {
      await stopProcessTree(webProcess);
    }
    await closeDb();
  }

  console.info(JSON.stringify({
    ok: true,
    appUrl: APP_URL,
    checkedRoutes: [
      '/sign-in',
      '/app',
      '/app/library',
      '/app/projects/local-smoke-project',
      '/app/projects/local-smoke-project/review',
      '/app/projects/local-smoke-project/pages',
      '/admin/runs',
      '/admin/runs/local-smoke-run',
      HUB_PATH,
      DETAIL_PATH,
    ],
    checkedThemes: ['paper', 'midnight', 'field'],
    outputDir: OUTPUT_DIR,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-browser-local] failed', error);
  process.exit(1);
});
