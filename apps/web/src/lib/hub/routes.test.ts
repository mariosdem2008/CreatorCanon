import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  getHubRoute, getStartRoute, getTopicsRoute, getTopicRoute,
  getPagesRoute, getPageRoute, getSourcesRoute, getSourceRoute,
  getMethodologyRoute, getSearchRoute, getAskRoute, getAskApiRoute,
} from './routes';

test('hub root', () => {
  assert.equal(getHubRoute('ali'), '/h/ali');
});

test('start, topics, pages, sources, methodology, ask roots', () => {
  assert.equal(getStartRoute('ali'),       '/h/ali/start');
  assert.equal(getTopicsRoute('ali'),      '/h/ali/topics');
  assert.equal(getPagesRoute('ali'),       '/h/ali/pages');
  assert.equal(getSourcesRoute('ali'),     '/h/ali/sources');
  assert.equal(getMethodologyRoute('ali'), '/h/ali/methodology');
  assert.equal(getAskRoute('ali'),         '/h/ali/ask');
  assert.equal(getAskApiRoute('ali'),      '/h/ali/ask/api');
});

test('parameterized routes', () => {
  assert.equal(getTopicRoute('ali', 'productivity'),       '/h/ali/topics/productivity');
  assert.equal(getPageRoute('ali', 'feynman-technique'),   '/h/ali/pages/feynman-technique');
  assert.equal(getSourceRoute('ali', 'vid_001'),           '/h/ali/sources/vid_001');
});

test('search route encodes query', () => {
  assert.equal(getSearchRoute('ali'),                  '/h/ali/search');
  assert.equal(getSearchRoute('ali', 'deep work'),     '/h/ali/search?q=deep%20work');
  assert.equal(getSearchRoute('ali', 'a&b=c'),         '/h/ali/search?q=a%26b%3Dc');
});
