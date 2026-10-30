import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

type NightStatus = {
  night: string;
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightStatus[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): NightStatus[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((file) => {
        const counts = { ok: 0, retry: 0, fail: 0 };
        for (const line of readFileSync(join(runsDir, file), 'utf8').split('\n')) {
          try {
            const event: unknown = JSON.parse(line);
            if (typeof event !== 'object' || event === null || Array.isArray(event)) continue;
            const status = (event as Record<string, unknown>).status;
            if (status === 'ok' || status === 'retry' || status === 'fail') counts[status] += 1;
          } catch {
            // Malformed run events do not prevent the board from rendering.
          }
        }
        return { night: file.slice(0, 10), ...counts };
      })
      .sort((a, b) => a.night.localeCompare(b.night))
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir),
  };
}
