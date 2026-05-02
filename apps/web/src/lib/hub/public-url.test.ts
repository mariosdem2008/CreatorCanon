import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPerProjectHubRoutePath,
  buildHubRoutePath,
  buildHubPublicUrl,
  buildHubSubdomainHostname,
  buildHubSubdomainUrl,
  getHubSubdomainFromHost,
  isHubPublicRoute,
} from './public-url';

describe('hub public URLs', () => {
  it('builds wildcard subdomain URLs when a root domain is configured', () => {
    assert.equal(
      buildHubSubdomainHostname('mario', {
        NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app',
      }),
      'mario.creatorcanon.app',
    );
    assert.equal(
      buildHubSubdomainUrl('mario', { NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app' }),
      'https://mario.creatorcanon.app',
    );
  });

  it('falls back to the shared /h route without a root domain', () => {
    assert.equal(
      buildHubSubdomainUrl('mario', { NEXT_PUBLIC_APP_URL: 'https://creatorcanon.com' }),
      'https://creatorcanon.com/h/mario',
    );
  });

  it('prefers custom domains over creatorcanon subdomains', () => {
    assert.equal(
      buildHubPublicUrl(
        { subdomain: 'mario', customDomain: 'learn.example.com' },
        { NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app' },
      ),
      'https://learn.example.com',
    );
  });

  it('extracts a hub subdomain from wildcard hostnames', () => {
    assert.equal(
      getHubSubdomainFromHost('mario.creatorcanon.app:3000', 'creatorcanon.app'),
      'mario',
    );
  });

  it('ignores the apex, www, app, and unrelated hostnames', () => {
    assert.equal(getHubSubdomainFromHost('creatorcanon.app', 'creatorcanon.app'), null);
    assert.equal(getHubSubdomainFromHost('www.creatorcanon.app', 'creatorcanon.app'), null);
    assert.equal(getHubSubdomainFromHost('app.creatorcanon.app', 'creatorcanon.app'), null);
    assert.equal(getHubSubdomainFromHost('demo.example.com', 'creatorcanon.app'), null);
  });

  it('builds root and nested shared hub route paths for middleware rewrites', () => {
    assert.equal(buildHubRoutePath('mario', '/'), '/h/mario');
    assert.equal(buildHubRoutePath('mario', '/library'), '/h/mario/library');
    assert.equal(buildHubRoutePath('mario', 'search'), '/h/mario/search');
  });

  it('identifies hub public routes without treating app routes as hub content', () => {
    assert.equal(isHubPublicRoute('/'), true);
    assert.equal(isHubPublicRoute('/library'), true);
    assert.equal(isHubPublicRoute('/library/video-1'), true);
    assert.equal(isHubPublicRoute('/app'), false);
    assert.equal(isHubPublicRoute('/api/deploy'), false);
  });

  it('uses a route-safe placeholder for per-project HUB_ID rewrites', () => {
    assert.equal(buildPerProjectHubRoutePath('hub_123', '/'), null);
    assert.equal(buildPerProjectHubRoutePath('hub_123', '/library'), '/h/hub/library');
    assert.equal(
      buildPerProjectHubRoutePath('hub_123', '/pillars/positioning'),
      '/h/hub/pillars/positioning',
    );
    assert.equal(buildPerProjectHubRoutePath('hub_123', '/app/projects'), null);
  });
});
