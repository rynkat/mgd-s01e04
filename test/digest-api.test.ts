import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest API', () => {
  it('returns digest rows sorted by job', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{"at":"2026-10-28T23:00:00+01:00","job":"job/z","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T23:01:00+01:00","job":"job/a","status":"retry","owner":null,"error":"busy"}',
      ].join('\n'),
    );

    const response = await appFor(runsDir).request('/api/digest/2026-10-28');
    const digest = await response.json();

    expect(response.status).toBe(200);
    expect(digest).toMatchObject({
      badLines: 0,
      rows: [{ job: 'job/a' }, { job: 'job/z' }],
    });
  });

  it('returns 404 when the night file does not exist', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));

    const response = await appFor(runsDir).request('/api/digest/missing');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'night not found' });
  });
});
