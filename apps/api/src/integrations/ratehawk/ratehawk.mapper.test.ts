import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JORDAN_UAE_SAMPLE } from './fixtures/jordan-uae-sample';
import {
  extractCandidateFields,
  extractImageGallery,
  extractShortDescription,
  extractThumbnailUrl,
  mapAmenities,
  mapCheckInOut,
  mapHighlights,
  starRatingToCategoryName,
} from './ratehawk.mapper';
import type { RateHawkHotelRaw } from './ratehawk.types';

const fixtures = JORDAN_UAE_SAMPLE;
function find(id: string): RateHawkHotelRaw {
  const found = fixtures.find((h) => h.id === id);
  if (!found) throw new Error(`fixture not found: ${id}`);
  return found;
}

test('extractCandidateFields — Amman Rotana', () => {
  const f = extractCandidateFields(find('amman_rotana'));
  assert.equal(f.rateHawkId, 'amman_rotana');
  assert.equal(f.name, 'Amman Rotana');
  assert.equal(f.countryCode, 'JO');
  assert.equal(f.cityName, 'Amman');
  assert.equal(f.starRating, 5);
  assert.equal(f.chainName, 'Rotana');
  assert.equal(f.kind, 'Hotel');
  assert.equal(f.photoCount, 3);
  assert.equal(f.latitude, 31.9539);
});

test('extractCandidateFields — Burj Al Arab (UAE)', () => {
  const f = extractCandidateFields(find('burj_al_arab'));
  assert.equal(f.countryCode, 'AE');
  assert.equal(f.cityName, 'Dubai');
  assert.equal(f.starRating, 5);
  assert.equal(f.chainName, 'Jumeirah');
});

test('extractCandidateFields — handles missing optional fields', () => {
  const raw: RateHawkHotelRaw = { id: 'min', name: 'Minimal' };
  const f = extractCandidateFields(raw);
  assert.equal(f.rateHawkId, 'min');
  assert.equal(f.name, 'Minimal');
  assert.equal(f.countryCode, null);
  assert.equal(f.cityName, null);
  assert.equal(f.starRating, null);
  assert.equal(f.photoCount, 0);
});

test('extractCandidateFields — strips country suffix from city name', () => {
  const raw: RateHawkHotelRaw = {
    id: 'x',
    name: 'X',
    region: { name: 'Dubai, United Arab Emirates', country_code: 'ae' },
  };
  const f = extractCandidateFields(raw);
  assert.equal(f.cityName, 'Dubai');
  assert.equal(f.countryCode, 'AE');
});

test('extractCandidateFields — rejects out-of-range star ratings', () => {
  const raw: RateHawkHotelRaw = { id: 'x', name: 'X', star_rating: 7 };
  const f = extractCandidateFields(raw);
  assert.equal(f.starRating, null);
});

test('extractShortDescription — first paragraph block, capped at 600 chars', () => {
  const desc = extractShortDescription(find('amman_rotana'));
  assert.ok(desc && desc.length > 0);
  assert.ok(desc!.includes('Amman Rotana'));
});

test('extractShortDescription — null when missing', () => {
  assert.equal(extractShortDescription({} as RateHawkHotelRaw), null);
});

test('extractThumbnailUrl — picks first image', () => {
  assert.equal(
    extractThumbnailUrl(find('amman_rotana')),
    'https://cdn.worldota.net/sample/amman-rotana-1.jpg',
  );
});

test('extractThumbnailUrl — null on empty images', () => {
  assert.equal(extractThumbnailUrl(find('sun_city_wadi_rum')), null);
});

test('extractImageGallery — returns all URLs', () => {
  const gal = extractImageGallery(find('amman_rotana'));
  assert.equal(gal.length, 3);
});

test('mapAmenities — Amman Rotana surfaces pool / spa / gym / valet / free-wifi', () => {
  const a = mapAmenities(find('amman_rotana'));
  assert.equal(a.pool, true);
  assert.equal(a.spa, true);
  assert.equal(a.gym, true);
  assert.equal(a.wifi, 'free');
  assert.equal(a.parking, 'valet');
  assert.equal(a.wheelchair, true);
  assert.equal(a.restaurants, 2);
  assert.equal(a.bars, 1);
});

test('mapAmenities — Kempinski Aqaba surfaces private beach', () => {
  const a = mapAmenities(find('kempinski_aqaba'));
  assert.equal(a.beachAccess, 'private');
  assert.equal(a.parking, 'free');
});

test('mapAmenities — Rixos JBR surfaces public beach + paid parking', () => {
  const a = mapAmenities(find('rixos_jbr'));
  assert.equal(a.beachAccess, 'public');
  assert.equal(a.parking, 'paid');
});

test('mapAmenities — Burj Al Arab is pet-friendly', () => {
  const a = mapAmenities(find('burj_al_arab'));
  assert.equal(a.petFriendly, true);
});

test('mapAmenities — Sun City Camp has no pool / spa / gym (minimal amenities)', () => {
  const a = mapAmenities(find('sun_city_wadi_rum'));
  assert.equal(a.pool, false);
  assert.equal(a.spa, false);
  assert.equal(a.gym, false);
  assert.equal(a.wifi, 'free');
  assert.equal(a.beachAccess, 'unknown');
});

test('mapAmenities — null/missing amenity_groups returns all defaults', () => {
  const a = mapAmenities({} as RateHawkHotelRaw);
  assert.equal(a.pool, false);
  assert.equal(a.wifi, 'unknown');
  assert.equal(a.parking, 'unknown');
  assert.equal(a.beachAccess, 'unknown');
  assert.equal(a.restaurants, 0);
});

test('mapHighlights — Amman Rotana populates identity + chain', () => {
  const h = mapHighlights(find('amman_rotana'));
  assert.equal(h.identity.address, 'Zahran Street, Jabal Amman, Amman');
  assert.equal(h.identity.phone, '+962 6 460 7000');
  assert.equal(h.identity.email, 'res.amman@rotana.com');
  assert.equal(h.identity.coordinates.lat, 31.9539);
  assert.equal(h.identity.coordinates.lng, 35.9106);
  assert.equal(h.stays.chain, 'Rotana');
});

test('mapHighlights — empty input returns zeroed structure (no throws)', () => {
  const h = mapHighlights({} as RateHawkHotelRaw);
  assert.equal(h.identity.address, null);
  assert.equal(h.identity.phone, null);
  assert.equal(h.identity.coordinates.lat, null);
  assert.equal(h.stays.chain, null);
  assert.equal(h.operational.notes, null);
});

test('mapCheckInOut — extracts both times', () => {
  const t = mapCheckInOut(find('amman_rotana'));
  assert.equal(t.checkInTime, '15:00');
  assert.equal(t.checkOutTime, '12:00');
});

test('mapCheckInOut — null when absent', () => {
  const t = mapCheckInOut({} as RateHawkHotelRaw);
  assert.equal(t.checkInTime, null);
  assert.equal(t.checkOutTime, null);
});

test('starRatingToCategoryName — common values', () => {
  assert.equal(starRatingToCategoryName(5), '5 Star');
  assert.equal(starRatingToCategoryName(4), '4 Star');
  assert.equal(starRatingToCategoryName(3), '3 Star');
  assert.equal(starRatingToCategoryName(null), null);
  assert.equal(starRatingToCategoryName(0), null);
  assert.equal(starRatingToCategoryName(7), null);
});

test('fixture file contains 5 Jordan + 5 UAE hotels', () => {
  const jo = fixtures.filter((h) => h.region?.country_code?.toUpperCase() === 'JO');
  const ae = fixtures.filter((h) => h.region?.country_code?.toUpperCase() === 'AE');
  assert.equal(jo.length, 5);
  assert.equal(ae.length, 5);
});
