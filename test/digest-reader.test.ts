import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  it('aggregates the 2026-10-28 run log and counts its malformed line', () => {
    const digest = readNight('runs', '2026-10-28');

    expect(digest.badLines).toBe(1);
    expect(digest.rows).toHaveLength(5);
    expect(digest.rows).toEqual([
      {
        job: 'rig/rotate-logs',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-28T23:00:02+01:00',
      },
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 8,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00',
        lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00',
        lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00',
        lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00',
        lastAt: '2026-10-29T05:41:09+01:00',
      },
    ]);
  });

  it('rejects invalid event shapes and aggregates valid events by timestamp', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    const lines = [
      '{not json}',
      '',
      '{"at":"yesterday","job":"job/a","status":"ok","owner":"rook"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"job/a","status":"unknown","owner":"rook"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"job/a","status":"ok"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"job/a","status":"ok","owner":"rook","extra":true}',
      '{"at":"2026-10-29T03:00:00+01:00","job":"job/a","status":"fail","owner":null,"error":"late failure"}',
      '{"at":"2026-10-29T01:00:00+01:00","job":"job/a","status":"retry","owner":"rook","error":"early retry"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"job/a","status":"ok","owner":"rook"}',
    ];
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), lines.join('\n'));

    expect(readNight(runsDir, '2026-10-29')).toEqual({
      badLines: 6,
      rows: [{
        job: 'job/a',
        owner: null,
        runs: 3,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'late failure',
        firstAt: '2026-10-29T01:00:00+01:00',
        lastAt: '2026-10-29T03:00:00+01:00',
      }],
    });
  });
});
