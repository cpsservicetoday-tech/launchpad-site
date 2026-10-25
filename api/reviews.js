// Live Google rating + reviews for launchpadservices.com.
// Reads GOOGLE_PLACES_API_KEY (+ optional GOOGLE_PLACE_ID) from the environment, never from code.
// Response shape matches what the main site's assets/js/main.js expects:
//   { ok, rating, count, reviews: [{ rating, text, author, when }] }
// Cached at Vercel's edge for 6 hours, so Google is called only a few times a day.

const ALLOWED_ORIGINS = [
  'https://www.launchpadservices.com',
  'https://launchpadservices.com',
  'https://blog.launchpadservices.com',
  'https://launchpad-website.pages.dev',
];
const SEARCH_TEXT = process.env.GOOGLE_PLACE_QUERY || 'Launchpad Services HVAC Palm Bay FL';

async function findPlaceId(key, fetchImpl) {
  const r = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress' },
    body: JSON.stringify({ textQuery: SEARCH_TEXT }),
  });
  if (!r.ok) throw new Error(`searchText ${r.status}`);
  const j = await r.json();
  const p = (j.places || [])[0];
  return p ? { id: p.id, name: p.displayName && p.displayName.text, address: p.formattedAddress } : null;
}

async function getReviews({ key, placeId, fetchImpl = fetch }) {
  if (!key) return { status: 200, body: { ok: false, configured: false } };
  let place = placeId ? { id: placeId } : await findPlaceId(key, fetchImpl);
  if (!place) return { status: 200, body: { ok: false, configured: true, error: 'place not found' } };
  const r = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,formattedAddress,rating,userRatingCount,reviews,googleMapsUri' },
  });
  if (!r.ok) return { status: 502, body: { ok: false, configured: true, error: `google ${r.status}` } };
  const d = await r.json();
  const reviews = (d.reviews || []).map((rv) => ({
    rating: rv.rating,
    text: (rv.text && rv.text.text) || (rv.originalText && rv.originalText.text) || '',
    author: (rv.authorAttribution && rv.authorAttribution.displayName) || 'Google user',
    when: rv.relativePublishTimeDescription || '',
  })).filter((rv) => rv.text);
  return {
    status: 200,
    body: {
      ok: !!d.rating, configured: true, rating: d.rating, count: d.userRatingCount, reviews,
      place: { id: place.id, name: d.displayName && d.displayName.text, address: d.formattedAddress, url: d.googleMapsUri },
    },
  };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const out = await getReviews({ key: process.env.GOOGLE_PLACES_API_KEY, placeId: process.env.GOOGLE_PLACE_ID });
    res.statusCode = out.status;
    // Good answers are cached 6h at the edge; errors only briefly so a fix shows up fast.
    res.setHeader('Cache-Control', out.body.ok ? 's-maxage=21600, stale-while-revalidate=86400' : 's-maxage=60');
    res.end(JSON.stringify(out.body));
  } catch (err) {
    console.error(err);
    res.statusCode = 502;
    res.setHeader('Cache-Control', 's-maxage=60');
    res.end(JSON.stringify({ ok: false, configured: true, error: 'upstream error' }));
  }
};
module.exports.getReviews = getReviews;
