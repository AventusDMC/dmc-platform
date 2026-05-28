// RateHawk Hotel Content API types.
//
// Mirrors the shape returned by the `hotel/info/` and the static
// content dump (`hotel/info/dump/`) endpoints. We don't claim 100%
// completeness — only the fields we actually consume during mapping
// are typed; everything else is preserved in `raw_json` for later use.
//
// Reference: RateHawk B2B v3 docs. Field names use snake_case to
// match the wire format exactly; the mapper converts to our camelCase
// schema.

export type RateHawkAmenityGroupRaw = {
  group_name?: string | null;
  amenities?: string[];
};

export type RateHawkImageRaw = {
  url?: string;
  type?: string;
};

export type RateHawkDescriptionStructItem = {
  title?: string;
  paragraphs?: string[];
};

export type RateHawkRoomRaw = {
  id?: string;
  name?: string;
  group_id?: number | null;
};

export type RateHawkRegionRaw = {
  id?: number;
  name?: string;
  country_code?: string;
  type?: string;
};

export type RateHawkHotelRaw = {
  id?: string; // RateHawk's internal hotel id, e.g. "amman_rotana"
  hid?: number; // numeric hotel id
  name?: string;
  address?: string;
  postal_code?: string;
  email?: string;
  phone?: string;
  star_rating?: number;
  kind?: string; // "Hotel" / "Resort" / "Apartments" / etc.
  region?: RateHawkRegionRaw;
  latitude?: number;
  longitude?: number;
  check_in_time?: string;
  check_out_time?: string;
  chain?: string;
  is_closed?: boolean;
  description_struct?: RateHawkDescriptionStructItem[];
  amenity_groups?: RateHawkAmenityGroupRaw[];
  images?: string[] | RateHawkImageRaw[];
  room_groups?: RateHawkRoomRaw[];
  policy_struct?: RateHawkDescriptionStructItem[];
};

export type RateHawkSyncResult = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ rateHawkId?: string; message: string }>;
};

export type CandidateFilter = {
  countryCode?: string;
  cityName?: string;
  starRating?: number;
  importedOnly?: boolean;
  notImportedOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type CandidateListItem = {
  id: string;
  rateHawkId: string;
  name: string;
  countryCode: string;
  cityName: string | null;
  addressLine: string | null;
  starRating: number | null;
  latitude: number | null;
  longitude: number | null;
  chainName: string | null;
  kind: string | null;
  photoCount: number;
  thumbnailUrl: string | null;
  importedHotelId: string | null;
  syncedAt: string;
};

export type CandidateListResponse = {
  total: number;
  offset: number;
  limit: number;
  items: CandidateListItem[];
};

export type ImportResult = {
  requested: number;
  created: number;
  skipped: number;
  errors: Array<{ candidateId: string; message: string }>;
  createdHotelIds: string[];
};
