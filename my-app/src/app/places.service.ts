import { Injectable } from '@angular/core';

export type PlaceLite = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  photoRef?: string | null;
};

const API = 'http://localhost:3001/api/places';

@Injectable({ providedIn: 'root' })
export class PlacesService {
  async autocomplete(q: string) {
    const res = await fetch(`${API}/autocomplete?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('places failed');
    return res.json() as Promise<{ places: PlaceLite[] }>;
  }
  photoUrl(ref?: string | null, max = 64) {
    return ref ? `${API}/photo?ref=${encodeURIComponent(ref)}&max=${max}` : null;
  }
}
