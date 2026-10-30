import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

const statuses = new Set<RunEvent['status']>(['ok', 'retry', 'fail']);
const eventKeys = new Set(['at', 'job', 'status', 'owner', 'error']);
const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !eventKeys.has(key))) return null;
  if (typeof event.at !== 'string' || !isoTimestamp.test(event.at) || Number.isNaN(Date.parse(event.at))) return null;
  if (typeof event.job !== 'string' || event.job.length === 0) return null;
  if (typeof event.status !== 'string' || !statuses.has(event.status as RunEvent['status'])) return null;
  if (!Object.hasOwn(event, 'owner') || (event.owner !== null && typeof event.owner !== 'string')) return null;
  if (event.error !== undefined && typeof event.error !== 'string') return null;

  return event as RunEvent;
}

export function readNight(runsDir: string, night: string): NightDigest {
  const lines = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8').split('\n');
  const rowsByJob = new Map<string, DigestRow>();
  const lastErrorAtByJob = new Map<string, number>();
  let badLines = 0;

  for (const [index, line] of lines.entries()) {
    if (line === '' && index === lines.length - 1) continue;

    const event = parseEvent(line);
    if (event === null) {
      badLines += 1;
      continue;
    }

    const row = rowsByJob.get(event.job);
    if (row === undefined) {
      rowsByJob.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
      if (event.error !== undefined) lastErrorAtByJob.set(event.job, Date.parse(event.at));
      continue;
    }

    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (Date.parse(event.at) < Date.parse(row.firstAt)) row.firstAt = event.at;
    if (event.error !== undefined && Date.parse(event.at) >= (lastErrorAtByJob.get(event.job) ?? -Infinity)) {
      row.lastError = event.error;
      lastErrorAtByJob.set(event.job, Date.parse(event.at));
    }
    if (Date.parse(event.at) >= Date.parse(row.lastAt)) {
      row.owner = event.owner;
      row.lastStatus = event.status;
      row.lastAt = event.at;
    }
  }

  return { rows: [...rowsByJob.values()], badLines };
}
