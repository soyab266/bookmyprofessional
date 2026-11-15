-- pincodes_lookup: reviewed pincode area centroids used ONLY for approximate
-- distance estimates in the near-me sort. Never written from profile data;
-- a professional changing pincode automatically gets the new pincode's row.
--
-- Seeded rows are limited to pincodes actually present on professional rows,
-- each centroid verified against at least two independent sources before insert.
--
-- Data attribution (GODL-India-1.0): pincode/district/state names and candidate
-- coordinates originate from the All India Pincode Directory, Department of
-- Posts, via Open Government Data Platform India (https://www.data.gov.in).
-- Cross-check sources per row are recorded in the source column.
-- NOTE: the official directory's own coordinate for 501218 (17.4739, 78.5119)
-- was REJECTED after independent checks placed it ~28 km off (Trimulgherry);
-- the 501218 centroid below comes from the cross-checked sources instead.

create table if not exists public.pincodes_lookup (
  pincode text primary key,
  district text,
  state text,
  latitude double precision not null,
  longitude double precision not null,
  source text not null,
  verified_at timestamptz not null default now()
);

alter table public.pincodes_lookup enable row level security;

create policy "pincodes_lookup public read"
  on public.pincodes_lookup for select
  using (true);

insert into public.pincodes_lookup (pincode, district, state, latitude, longitude, source) values
  ('501218', 'K.V.Rangareddy', 'Telangana', 17.2558, 78.3532,
   'OpenStreetMap Nominatim postcode centroid, corroborated by BigDataCloud locality resolution (Shamshabad); area-level estimate');

-- CANDIDATE, NOT SEEDED - pending second-source verification:
-- ('400014', 'Mumbai', 'Maharashtra', 19.0139, 72.8470,
--   'All India Pincode Directory (data.gov.in, GODL-India-1.0), centroid of 3 offices; single source so far, area-level estimate')
-- Until reviewed, 400014 profiles resolve via the Mumbai city centroid exactly as today.
