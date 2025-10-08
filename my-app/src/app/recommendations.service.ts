import { Injectable } from '@angular/core';

export type RecItem = {
  placeId: string;
  type: string;
  name: string;
  rating: number | null;
  ratingsTotal: number;
  priceLevel: number | null;
  address: string;
  lat: number;
  lng: number;
  photo: string | null;
};

@Injectable({ providedIn: 'root' })
export class RecommendationsService {
  private API = 'http://localhost:3001';

  async get(city: string, types = ['restaurant','lodging','tourist_attraction']) {
    const url = new URL(`${this.API}/api/places/recommend`);
    url.searchParams.set('city', city);
    url.searchParams.set('types', types.join(','));
    url.searchParams.set('limit', '20');
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('recommend fetch failed');
    return await res.json() as { center: {lat:number,lng:number}, items: RecItem[] };
  }
}
