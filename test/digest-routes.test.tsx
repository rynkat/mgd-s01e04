import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

const baseConfig: Omit<RigConfig, 'runsDir'> = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('serves the same job rows in sorted order as HTML and JSON', async () => {
    writeNight('2026-10-29', [
      event('job/zulu', 'retry', 'rook', 'temporary failure'),
      event('job/alpha', 'ok', null),
      event('job/zulu', 'ok', 'rook'),
    ]);
    const app = createApp({ ...baseConfig, runsDir });

    const htmlResponse = await app.request('/digest/2026-10-29');
    const jsonResponse = await app.request('/api/digest/2026-10-29');
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(digest).toEqual({
      badLines: 0,
      rows: [
        {
          job: 'job/alpha',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
        {
          job: 'job/zulu',
          owner: 'rook',
          runs: 2,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'temporary failure',
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
      ],
    });
    expect(html).toContain('job/alpha');
    expect(html).toContain('job/zulu');
    expect(html.indexOf('job/alpha')).toBeLessThan(html.indexOf('job/zulu'));
  });

  it('returns 404 from both routes when the night does not exist', async () => {
    const app = createApp({ ...baseConfig, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-29'),
      app.request('/api/digest/2026-10-29'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders the empty state and returns an empty digest for an empty night', async () => {
    writeNight('2026-10-29', []);
    const app = createApp({ ...baseConfig, runsDir });

    const htmlResponse = await app.request('/digest/2026-10-29');
    const jsonResponse = await app.request('/api/digest/2026-10-29');

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('keeps serving valid rows when the night contains a malformed line', async () => {
    writeNight('2026-10-29', [
      event('job/alpha', 'fail', 'rook', 'disk full'),
      '{not json}',
    ]);
    const app = createApp({ ...baseConfig, runsDir });

    const htmlResponse = await app.request('/digest/2026-10-29');
    const jsonResponse = await app.request('/api/digest/2026-10-29');
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('job/alpha');
    expect(html).toContain('disk full');
    expect(jsonResponse.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows).toHaveLength(1);
    expect(digest.rows[0]).toMatchObject({ job: 'job/alpha', lastStatus: 'fail' });
  });

  function writeNight(night: string, lines: string[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
  }
});

function event(job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) {
  return JSON.stringify({
    at: '2026-10-29T01:00:00+01:00',
    job,
    status,
    owner,
    ...(error === undefined ? {} : { error }),
  });
}
