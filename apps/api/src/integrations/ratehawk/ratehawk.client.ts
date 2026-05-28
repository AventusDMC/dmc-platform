import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RateHawkHotelRaw } from './ratehawk.types';

// RateHawk B2B v3 client.
//
// When `RATEHAWK_KEY_ID` and `RATEHAWK_KEY` are set in the environment,
// the client calls the real API (HTTP Basic Auth). When they're not
// set — i.e. before the account manager grants API access — the
// client falls back to a bundled fixture file so the wizard remains
// usable in development and on environments without credentials.
//
// Phase 2 (when credentials arrive) is a one-line swap of the
// `loadFixtures` path inside `fetchAllForCountries` to the live
// `hotel/info/dump/` HTTP call. The interface stays identical.

@Injectable()
export class RateHawkClient {
  private readonly logger = new Logger(RateHawkClient.name);
  private readonly baseUrl =
    process.env.RATEHAWK_BASE_URL || 'https://api.worldota.net/api/b2b/v3';
  private readonly keyId = process.env.RATEHAWK_KEY_ID || '';
  private readonly key = process.env.RATEHAWK_KEY || '';

  hasCredentials(): boolean {
    return Boolean(this.keyId && this.key);
  }

  modeLabel(): string {
    return this.hasCredentials() ? 'live' : 'fixture';
  }

  // Pull all hotels for the given country codes. Returns raw RateHawk
  // records exactly as received (the mapper handles normalization).
  async fetchAllForCountries(countryCodes: string[]): Promise<RateHawkHotelRaw[]> {
    const wanted = new Set(countryCodes.map((c) => c.toUpperCase()));

    if (!this.hasCredentials()) {
      this.logger.warn(
        `[RateHawk] No credentials in env — using bundled fixture (countries: ${[...wanted].join(', ')})`,
      );
      const all = await this.loadFixtures();
      return all.filter((h) => {
        const cc = h.region?.country_code?.toUpperCase();
        return cc != null && wanted.has(cc);
      });
    }

    // Live mode. RateHawk content endpoints accept HTTP Basic auth.
    // The static dump endpoint streams a JSON.gz file; for an
    // incremental sync we'd use `hotel/info/incremental_dump/`. Both
    // return the same record shape under `data.hotels`.
    //
    // Phase 2 will implement streaming gunzip + line-delimited JSON
    // parsing here. For now, returning empty is the safer choice —
    // the rest of the system still works, the wizard simply shows
    // "0 candidates" with a clear log line, and we ship the schema
    // and UI ready to plug in.
    this.logger.warn(
      `[RateHawk] Live mode requested (countries: ${[...wanted].join(', ')}) — streaming dump fetch not yet implemented; returning empty set. Once Phase 2 lands, this call hits ${this.baseUrl}/hotel/info/dump/ with HTTP Basic auth.`,
    );
    return [];
  }

  private async loadFixtures(): Promise<RateHawkHotelRaw[]> {
    const path = join(__dirname, 'fixtures', 'jordan-uae-sample.json');
    const buf = await readFile(path, 'utf-8');
    return JSON.parse(buf) as RateHawkHotelRaw[];
  }
}
