import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AI_DATA_CENTERS } from '../src/config/ai-datacenters.ts';

const PRECISIONS = new Set(['site', 'city', 'region', 'country']);

describe('AI datacenter location metadata', () => {
  it('pairs every locationPrecision with a review date and a description', () => {
    for (const dc of AI_DATA_CENTERS.filter((entry) => entry.locationPrecision)) {
      assert.ok(PRECISIONS.has(dc.locationPrecision), `${dc.id} has unknown precision ${dc.locationPrecision}`);
      assert.match(dc.metadataReviewedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `${dc.id} needs metadataReviewedAt`);
      assert.ok(dc.description, `${dc.id} must explain what its map point represents`);
    }
  });

  it('marks how precise every South Korean map point is', () => {
    const korean = AI_DATA_CENTERS.filter((dc) => dc.country === 'Korea (Republic of)');
    assert.ok(korean.length > 0);
    for (const dc of korean) {
      assert.ok(dc.locationPrecision, `${dc.id} (${dc.name}) has an unreviewed map point`);
      if (dc.locationPrecision === 'site' || dc.locationPrecision === 'city') {
        assert.ok(dc.sourceUrl, `${dc.id} needs a source for a ${dc.locationPrecision}-level location`);
      }
    }
  });
});
