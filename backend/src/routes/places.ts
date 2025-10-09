// backend/src/routes/places.ts
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

const BASE = "https://places.googleapis.com/v1";
const API_KEY = process.env.GOOGLE_PLACES_KEY!;
if (!API_KEY) console.warn("⚠️ GOOGLE_PLACES_KEY missing in .env");

// Helper – the auth/field-mask headers for JSON calls
function headers(fieldMask: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "X-Goog-Api-Key": API_KEY,
    ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
  };
}




// --- replace ONLY the /autocomplete route with this ---
/** GET /api/places/autocomplete?q=paris[&lang=en][&region=US] */
router.get("/autocomplete", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ places: [] });

  const languageCode = String(req.query.lang ?? "en");
  // region is a bias, not a hard filter; leave it blank to avoid biasing
  const regionCode = String(req.query.region ?? "").toUpperCase() || undefined;

  // Types that represent administrative areas (no buildings/POIs)
  const ADMIN_PRIMARY_TYPES = [
    "locality",                    // city/town
    "postal_town",                 // UK-style towns
    "administrative_area_level_2", // county/district
    "administrative_area_level_1", // state/province
    "country",                     // country
  ];

  // Helper: map types to a friendly "kind" for your UI badges
  const kindFromTypes = (types: string[] = []): "city" | "state" | "country" | "region" => {
    if (types.includes("country")) return "country";
    if (types.includes("administrative_area_level_1")) return "state";
    if (types.includes("locality") || types.includes("postal_town")) return "city";
    // level_2 or anything else admin-ish becomes "region"
    return "region";
  };

  try {
    // 1) Autocomplete limited to admin-area primary types
    const ac = await fetch(`${BASE}/places:autocomplete`, {
      method: "POST",
      headers: headers(
        [
          "suggestions.placePrediction.placeId",
          "suggestions.placePrediction.types",
          "suggestions.placePrediction.text",
        ].join(",")
      ),
      body: JSON.stringify({
        input: q,
        languageCode,
        regionCode,                     // optional bias
        includedPrimaryTypes: ADMIN_PRIMARY_TYPES,
        // (optional) If you really want to *avoid* POIs that slip in, keep primary types strict
      }),
    });

    if (!ac.ok) {
      const txt = await ac.text();
      console.error("autocomplete error", ac.status, txt);
      return res.status(502).json({ error: "autocomplete failed" });
    }

    const acData = (await ac.json()) as {
      suggestions?: Array<{
        placePrediction?: { placeId?: string; types?: string[]; text?: { text?: string } };
      }>;
    };

    // Whitelist filter (defensive): keep only suggestions that still look admin-level
    const adminSuggestions =
      (acData.suggestions ?? []).filter(s => {
        const t = s.placePrediction?.types ?? [];
        return t.some(x =>
          x === "locality" ||
          x === "postal_town" ||
          x === "administrative_area_level_2" ||
          x === "administrative_area_level_1" ||
          x === "country"
        );
      });

    const ids = [...new Set(
      adminSuggestions
        .map(s => s.placePrediction?.placeId)
        .filter((v): v is string => !!v)
    )].slice(0, 8);

    if (!ids.length) return res.json({ places: [] });

    // 2) Fetch minimal details for each place id (still admin-only)
    const places = await Promise.all(ids.map(async (id) => {
      const r = await fetch(`${BASE}/places/${encodeURIComponent(id)}`, {
        headers: headers([
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "photos",
          "types",
        ].join(",")),
      });

      if (!r.ok) {
        console.warn("place fetch failed for", id, await r.text());
        return null;
      }

      const d = await r.json() as any;
      const types: string[] = d.types ?? [];
      const kind = kindFromTypes(types);

      return {
        id: d.id ?? "",
        name: d.displayName?.text ?? "",
        address: d.formattedAddress ?? "",
        lat: d.location?.latitude ?? null,
        lng: d.location?.longitude ?? null,
        photoRef: d.photos?.[0]?.name ?? null,  // "places/<PLACE_ID>/photos/<PHOTO_RESOURCE>"
        kind,                                    // "city" | "state" | "country" | "region"
        types,                                   // keep raw types if you need them
      };
    }));

    res.json({ places: places.filter(Boolean) });
  } catch (e) {
    console.error("autocomplete error", e);
    res.status(500).json({ error: "Places error" });
  }
});



// GET /api/places/recommend?q=Chicago&type=food&limit=20
router.get("/recommend", async (req, res) => {
  //return res.status(500).json({ error: "Simulated server failure" });

  
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "missing q" });

    const typeParam = String(req.query.type ?? "").trim();   // "food" | "stay" | "do" | ""
    const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);

    // map UI tab → Places includedType
    const mapType = (t: string) =>
      t === "food" ? "restaurant" :
      t === "stay" ? "lodging"  :
      t === "do"   ? "tourist_attraction" : "";

    // 1) City → lat/lng
    const ts = await fetch(`${BASE}/places:searchText`, {
      method: "POST",
      headers: headers("places.location"),
      body: JSON.stringify({
        textQuery: q,
        languageCode: "en",
        includedType: "locality",
      }),
    });
    if (!ts.ok) return res.status(502).json({ error: "searchText failed" });

    const tsData = await ts.json() as {
      places?: Array<{ location?: { latitude: number; longitude: number } }>;
    };
    const loc = tsData.places?.[0]?.location;
    if (!loc) return res.json({ items: [], center: null });

    const center = { lat: loc.latitude, lng: loc.longitude };

    // ---- price helpers ----
    const PRICE_MAP: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    const priceTextFromLevel = (level?: string | null): string | null => {
      if (!level) return null;
      const tier = PRICE_MAP[level];
      if (tier === undefined) return null;
      if (tier === 0) return "Free";
      return "$".repeat(tier); // 1→$, 2→$$, 3→$$$, 4→$$$$
    };

    // 2) Nearby helper — center must be { latitude, longitude }
    const nearbyFor = async (includedType: string) => {
      if (!includedType) return [];

      const r = await fetch(`${BASE}/places:searchNearby`, {
        method: "POST",
        headers: headers(
          "places.id,places.displayName,places.formattedAddress,places.location," +
          "places.rating,places.userRatingCount,places.priceLevel,places.photos.name"
        ),
        body: JSON.stringify({
          includedTypes: [includedType],
          maxResultCount: limit,
          locationRestriction: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: 2000,
            },
          },
          languageCode: "en",
        }),
      });
      if (!r.ok) return [];

      const d = await r.json() as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude: number; longitude: number };
          rating?: number;
          userRatingCount?: number;
          priceLevel?: string;
          photos?: Array<{ name?: string }>;
        }>;
      };

      return (d.places ?? []).map((p) => {
        const photoName = p.photos?.[0]?.name ?? null;
        // IMPORTANT: use encodeURI, not encodeURIComponent (keep slashes)
        const photo = photoName
          ? `${BASE}/${encodeURI(photoName)}/media?maxHeightPx=400&maxWidthPx=900&key=${API_KEY}`
          : null;

        const priceEnum = p.priceLevel ?? null;
        const priceLevel = priceEnum ? (PRICE_MAP[priceEnum] ?? null) : null;
        const priceText = priceTextFromLevel(priceEnum);

        return {
          id: p.id ?? "",
          name: p.displayName?.text ?? "",
          address: p.formattedAddress ?? "",
          lat: p.location?.latitude ?? null,
          lng: p.location?.longitude ?? null,
          rating: p.rating ?? null,
          userRatings: p.userRatingCount ?? 0,
          priceLevel,             // 0..4 or null
          priceText,              // "Free" | "$".."$$$$" | null
          type: includedType,
          photo,
        };
      });
    };

    const types = typeParam ? [mapType(typeParam)] : ["restaurant", "lodging", "tourist_attraction"];
    const buckets = await Promise.all(types.map(nearbyFor));
    const items = buckets.flat().filter(x => x.lat != null && x.lng != null);

    res.json({ center, items });
  } catch (e: any) {
    console.error("recommend error:", e?.message || e);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
    
});



export default router;