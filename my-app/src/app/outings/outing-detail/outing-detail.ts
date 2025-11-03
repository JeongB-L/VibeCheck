import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  inject,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';

const API = 'http://localhost:3001';

// google maps global (loaded by a <script> in index.html)
declare const google: any;

type PlanStop = {
  time?: string;
  name?: string;
  address?: string;
  categories?: string[];
  matches?: string[];
  priceRange?: string | null;
  description?: string;
  cost_estimate?: string;
  notes?: string;
};

type PlanDay = { date?: string; timeline?: PlanStop[] };
type GeneratedPlan = {
  planId?: string;
  title?: string;
  name?: string;
  badge?: string[];
  overview?: string;
  itinerary: PlanDay[];
  total_budget_estimate?: string;
  fairness_scores?: Record<string, number>;
  avgFairnessIndex?: number | null;
  summary?: {
    durationHours?: number;
    totalDistanceKm?: number;
    avgFairnessIndex?: number;
    satisfaction?: Record<string, number>;
  };
  tips?: string;
};

type PlansPayload = { city?: string; plans: GeneratedPlan[] };



type Outing = {
  id: number;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  creator_id: string;
  created_at: string;
};

type RecItem = {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  rating?: number;
  priceLevel?: number; // 0..4 or null
  priceText?: string | null; // "Free" | "$".."$$$$"
  type?: string;
  photo?: string | null;
};

type RecResp = {
  center: { lat: number; lng: number } | null;
  items: RecItem[];
};

type TabKey = 'food' | 'stay' | 'do';
type Prefs = { activities: string[]; food: string[]; budget: string[] };
type PrefEntry = { email: string; user_id: string | null; prefs: Prefs | null };

@Component({
  standalone: true,
  selector: 'app-outing-detail',
  imports: [CommonModule, RouterModule, HeaderComponent],
  templateUrl: './outing-detail.html',
  styleUrls: ['./outing-detail.css'],
})
export class OutingDetail implements OnInit, AfterViewInit {
  constructor(private toast: ToastrService, router: Router, private cdr: ChangeDetectorRef) {}

  trackById(_i: number, item: RecItem) {
    return item.id;
  }

// Which panel shows on the left
leftView = signal<'recs' | 'plans'>('recs');

// Keep recommendations in items(); keep plan stop pins separately:
planPins = signal<RecItem[]>([]);

plans = signal<GeneratedPlan[] | null>([]);
activePlanIdx = signal<number>(0);
resolving = signal<boolean>(false);


  // --- Members ---
  members: any[] = [];
  owner: any = null;

  // --- Group profile state ---
  showGroupProfile = false;
  prefsLoading = false;
  prefsMap = new Map<string, PrefEntry>();

  get isOwner() {
    const o = this.outing();
    const myId = sessionStorage.getItem('userId'); // uuid stored at login
    return !!o && !!myId && myId === o.creator_id;
  }

  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  isBrowser = isPlatformBrowser(this.platformId);
  showMap = signal(false);

  private route = inject(ActivatedRoute);

  // ---------- state ----------
  outing = signal<Outing | null>(null);
  loading = signal<boolean>(true);
  tab = signal<TabKey>('food');
  generating = signal<boolean>(false);

  items = signal<RecItem[]>([]);
  selectedId = signal<string | null>(null);

  // ---------- map (plain JS API) ----------
  @ViewChild('mapEl', { static: false }) mapEl!: ElementRef<HTMLDivElement>;
  private gmap?: any;
  private gmarkers: any[] = [];
  private markerById = new Map<string, any>();
  private info?: any;

  mapOptions: any = {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy',
    clickableIcons: false,
    zoom: 12,
  };

  // --- marker icon holders (use Icon, not Symbol) ---
  private iconDefault?: google.maps.Icon;
  private iconActive?: google.maps.Icon;
  private iconDimmed?: google.maps.Icon;

  private makePin(color: string, scale = 1) {
    const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${22 * scale}" height="${
      33 * scale
    }" viewBox="0 0 28 42">
      <path fill="${color}" opacity="0.85" d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.27 21.73 0 14 0z"/>
      <circle cx="14" cy="14" r="${4.5 * scale}" fill="white"/>
    </svg>`);
    return {
      url: `data:image/svg+xml;charset=UTF-8,${svg}`,
      anchor: new google.maps.Point(11 * scale, 33 * scale),
      scaledSize: new google.maps.Size(22 * scale, 33 * scale),
    } as google.maps.Icon;
  }

  // ---------- lifecycle ----------
  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    await this.fetchOuting(id);
    await this.loadTab('food');
    if (this.isBrowser) this.showMap.set(true);

    this.fetchGeneratedPlan(id); //GEN
  }

  async ngAfterViewInit() {
    if (!this.isBrowser) return;
    await this.waitForMaps();
    this.ensureMap();
  }

  //GEN 
  private normalizeClient(payload: any): PlansPayload {
  // Defensive client-side guard in case backend isn't updated.
  if (!payload || typeof payload !== 'object') return { plans: [] };
  const plans = Array.isArray(payload.plans) ? payload.plans : [];
  for (const p of plans) {
    if (!Array.isArray(p.itinerary)) p.itinerary = [];
    for (const d of p.itinerary) {
      if (!Array.isArray(d.timeline)) d.timeline = [];
    }
    if (!p.title && p.name) p.title = p.name;
    if (!p.title) p.title = 'Plan';
    if (!Array.isArray(p.badge)) p.badge = [];
  }
  return { city: payload.city || '', plans };
}

 private async fetchGeneratedPlan(outingId: number) {
  try {
    const r = await fetch(`${API}/api/outings/${outingId}/plan`);
    if (!r.ok) return; // not generated yet
    const body = await r.json();
    const norm = this.normalizeClient(body);
    this.plans.set(norm.plans);
    if (norm.plans.length) {
      this.activePlanIdx.set(0);
      await this.resolveAndPlot(norm.plans[0]);
    }
  } catch (e) {
    // noop; keep UI running
  }
}

// NEW public wrapper so template can call it safely
refreshPlans() {
  const id = this.outing()?.id;
  if (id) this.fetchGeneratedPlan(id);
}

private async resolveAndPlot(plan: GeneratedPlan) {
  if (!this.isBrowser || !plan || !plan.itinerary?.length) {
    this.planPins.set([]);
    this.renderMarkers();           // redraw map (will show only recs if any)
    this.fitAllPins();              // fit whatever pins exist
    return;
  }

  const stops = plan.itinerary
    .flatMap(d => d.timeline || [])
    .filter(s => (s?.name || s?.address))
    .map(s => ({ name: s.name ?? '', address: s.address ?? '' }))
    .slice(0, 40);

  if (!stops.length) {
    this.planPins.set([]);
    this.renderMarkers();
    this.fitAllPins();
    return;
  }

  this.resolving.set(true);
  try {
    const res = await fetch(`${API}/api/places/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'resolve failed');

    const look = new Map<string, any>();
    for (const r of (body.results || [])) {
      const k = `${(r.query?.name||'').trim()}|${(r.query?.address||'').trim()}`.toLowerCase();
      look.set(k, r);
    }

    const resolved: RecItem[] = [];
    for (const day of plan.itinerary) {
      for (const s of (day.timeline || [])) {
        const k = `${(s.name||'').trim()}|${(s.address||'').trim()}`.toLowerCase();
        const hit = look.get(k);
        if (hit?.lat != null && hit?.lng != null) {
          resolved.push({
            id: `${day.date ?? ''}|${s.time ?? ''}|${s.name ?? ''}`,
            name: s.name ?? '(Unnamed)',
            address: hit.address ?? s.address ?? '',
            lat: hit.lat, lng: hit.lng,
            photo: hit.photo ?? null,
  
          });
        }
      }
    }

    this.planPins.set(resolved);
    await this.waitForMaps();
    this.ensureMap();
    this.renderMarkers();   // ⬅️ now draws both recs + plan pins
    this.fitAllPins();
  } catch {
    this.planPins.set([]);
    this.renderMarkers();
    this.fitAllPins();
  } finally {
    this.resolving.set(false);
  }
}


setActivePlan(i: number) {
  const all = this.plans();
  if (!all || !all[i]) return;
  this.activePlanIdx.set(i);
  this.resolveAndPlot(all[i]);
}


openStopInMaps(s: PlanStop) {
  const q = encodeURIComponent(`${s.name ?? ''} ${s.address ?? ''}`.trim());
  if (!q) return;
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
}


  
  private fitAllPins() {
  if (!this.gmap) return;

  const all = [...this.items(), ...this.planPins()];
  if (!all.length) return;

  const bounds = new google.maps.LatLngBounds();
  for (const p of all) bounds.extend({ lat: p.lat, lng: p.lng });

  if (!bounds.isEmpty()) this.gmap.fitBounds(bounds, 48);
}


  // ---------- data ----------
  private get userEmail(): string | null {
    return sessionStorage.getItem('userEmail');
  }

  private async waitForMaps(maxMs = 10000) {
    const start = Date.now();
    while (!(window as any).google?.maps?.Map) {
      if (Date.now() - start > maxMs) throw new Error('Maps JS not loaded');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async fetchOuting(id: number) {
    this.loading.set(true);
    try {
      const qs = this.userEmail ? `?email=${encodeURIComponent(this.userEmail)}` : '';
      const res = await fetch(`${API}/api/outings/${id}${qs}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Failed to load outing');
      this.outing.set(body.outing as Outing);

      // ✅ fetch members
      const memRes = await fetch(`${API}/api/outings/${id}/members`);
      const memBody = await memRes.json().catch(() => ({}));
      if (memRes.ok) {
        this.owner = memBody.owner || null;
        this.members = memBody.members || [];

        await this.loadGroupPreferences();
      } else {
        this.toast.error('Failed to load members');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async removeMember(memberEmail: string, ev: Event) {
    ev.stopPropagation();
    const o = this.outing();
    if (!o) return;

    if (!confirm(`Remove ${memberEmail} from this outing?`)) return;

    try {
      const res = await fetch(`${API}/api/outings/${o.id}/removeMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // include the requester (you) + the member to remove
        body: JSON.stringify({
          requesterEmail: this.userEmail,
          memberEmail,
        }),
      });

      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error || 'Failed to remove member');

      this.toast.success('Member removed');
      // Optimistic refresh
      this.members = this.members.filter((m) => m.email !== memberEmail);
    } catch (err: any) {
      this.toast.error(err?.message || 'Error removing member');
    }
  }

  async loadTab(key: TabKey) {
    const o = this.outing();
    if (!o) return;

    this.loading.set(true);
    this.tab.set(key);
    this.selectedId.set(null);

    const serverType = key === 'food' ? 'food' : key === 'stay' ? 'stay' : 'do';

    try {
      const url = `${API}/api/places/recommend?q=${encodeURIComponent(
        o.location
      )}&type=${serverType}&limit=20`;
      const res = await fetch(url);

      if (!res.ok) {
        this.toast.error('Failed to load recommendations (server error).');
        this.items.set([]); // clear list
        return;
      }

      const data = (await res.json()) as RecResp;

      this.items.set(data.items ?? []);

      setTimeout(async () => {
        await this.waitForMaps();
        this.ensureMap();
        this.renderMarkers();
        // this.fitMapBounds(data);
        this.fitAllPins();
      }, 0);
    } catch (err: any) {
      this.items.set([]);
      this.toast.error('Failed to load recommendations: ' + (err?.message || 'Unknown error'));
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- map helpers ----------
  private ensureMap() {
    if (!this.gmap && this.mapEl && typeof (window as any).google !== 'undefined') {
      this.gmap = new google.maps.Map(this.mapEl.nativeElement, this.mapOptions);

      // init icons + infowindow once
      if (!this.iconDefault) this.iconDefault = this.makePin('#d32f2f', 0.9); // smaller red
      if (!this.iconActive) this.iconActive = this.makePin('#1976d2', 1.2); // bright blue, slightly larger
      if (!this.iconDimmed) this.iconDimmed = this.makePin('#aaaaaa', 0.8); // gray dimmed

      if (!this.info) this.info = new google.maps.InfoWindow();
    }
  }

private renderMarkers() {
  if (!this.gmap) return;

  // clear old markers
  for (const m of this.gmarkers) m.setMap(null);
  this.gmarkers = [];
  this.markerById.clear();

  // === RECOMMENDATIONS (red pins) ===
  for (const p of this.items()) {
    const m = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      title: p.name,
      map: this.gmap,
      icon: this.iconDefault,   // red
      zIndex: 1,
    });

    // 🟢 store info directly on marker
    (m as any).__id    = `rec:${p.id}`;
    (m as any).__title = p.name ?? '(Unnamed)';
    (m as any).__addr  = p.address ?? '';

    this.gmarkers.push(m);
    this.markerById.set(`rec:${p.id}`, m);

    // event listeners
    m.addListener('mouseover', () => this.setActiveMarker(`rec:${p.id}`));
    m.addListener('mouseout',  () => this.setActiveMarker(null));
    m.addListener('click',     () => this.setActiveMarker(`rec:${p.id}`));
  }

  // === PLAN STOPS (blue pins) ===
  for (const p of this.planPins()) {
    const m = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      title: p.name,
      map: this.gmap,
      icon: this.iconActive,    // blue
      zIndex: 2,
    });

    // 🟢 same metadata pattern
    (m as any).__id    = `plan:${p.id}`;
    (m as any).__title = p.name ?? '(Unnamed)';
    (m as any).__addr  = p.address ?? '';

    this.gmarkers.push(m);
    this.markerById.set(`plan:${p.id}`, m);

    m.addListener('mouseover', () => this.setActiveMarker(`plan:${p.id}`));
    m.addListener('mouseout',  () => this.setActiveMarker(null));
    m.addListener('click',     () => this.setActiveMarker(`plan:${p.id}`));
  }
}



  private fitMapBounds(resp: RecResp) {
    if (!this.gmap) return;

    const bounds = new google.maps.LatLngBounds();
    if (resp.center) bounds.extend(resp.center);
    (resp.items ?? []).forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));

    if (!bounds.isEmpty()) {
      this.gmap.fitBounds(bounds, 48); // padding
    } else if (resp.center) {
      this.gmap.panTo(resp.center);
      this.gmap.setZoom(12);
    }
  }

  private setActiveMarker(id: string | null) {
  for (const m of this.gmarkers) {
    const active = (m as any).__id === id;
    m.setIcon(active ? this.iconActive : this.iconDefault);
    m.setZIndex(active ? 1000 : 1);
    m.setOpacity(id ? (active ? 1 : 0.45) : 1);
  }

  if (!id) { this.info?.close(); return; }

  const m = this.markerById.get(id);
  if (!m || !this.info) return;

  const title = (m as any).__title || m.getTitle?.() || '(Unnamed)';
  const addr  = (m as any).__addr  || '';

  this.info.setContent(
    `<div style="font:500 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto">
       <div><strong>${this.escapeHtml(title)}</strong></div>
       ${addr ? `<div style="color:#666;margin-top:2px">${this.escapeHtml(addr)}</div>` : ''}
     </div>`
  );
  this.info.open({ anchor: m, map: this.gmap, shouldFocus: false });
}

private escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string)
  );
}


  async openGroupProfile() {
    this.showGroupProfile = !this.showGroupProfile;
  }

  private async loadGroupPreferences() {
    const o = this.outing();
    if (!o) return;

    const people = this.groupMembers();
    if (!people.length) return;

    const outingId = Number(this.route.snapshot.paramMap.get('id'));
    if (!outingId) return;

    const emails = people
      .map((p) =>
        String(p.email || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    if (!emails.length) return;

    this.prefsLoading = true;
    try {
      const res = await fetch(`${API}/api/outings/${outingId}/preferences/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load preferences');

      (body.list || []).forEach((item: any) => {
        const key = String(item.email || '').toLowerCase();
        this.prefsMap.set(key, item);
      });

      console.log(
        '[group]',
        this.groupMembers().map((p) => p.email)
      );
      console.log('[prefs keys]', Array.from(this.prefsMap.keys()));
      // ^ this shows who we asked for and whose prefs we actually got
    } catch (err) {
      console.error('Failed to load preferences', err);
      this.toast.error('Failed to load preferences');
    } finally {
      this.prefsLoading = false;
    }
  }

  hasAnyPref(p?: Prefs | null) {
    if (!p) return false;
    return !!(p.activities?.length || p.food?.length || p.budget?.length);
  }

  async openPreferences() {
    // Simply navigates to the current user's outing preferences page
    const outingId = this.outing()?.id;
    if (outingId) {
      this.router.navigate([`/outings/${outingId}/my-outing-preferences`]);
    } else {
      this.toast.error('Unable to navigate: Outing not loaded');
    }
  }

  // ---------- UI handlers ----------
 hoverItem(p: RecItem | null) { const id = p?.id ?? null; this.selectedId.set(id); this.setActiveMarker(id); if (p && this.gmap) this.gmap.panTo({ lat: p.lat, lng: p.lng }); }

  openInMaps(p: RecItem) {
    const q = encodeURIComponent(`${p.name} ${p.address ?? ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  }

  groupMembers(): Array<any> {
    const seen = new Set<string>();
    const list: any[] = [];

    // owner first (if present)
    if (this.owner?.email) {
      const e = String(this.owner.email).trim().toLowerCase();
      if (e && !seen.has(e)) {
        list.push({ ...this.owner, __role: 'owner' });
        seen.add(e);
      }
    }

    // then the rest of the members
    for (const m of this.members || []) {
      const e = String(m.email || '')
        .trim()
        .toLowerCase();
      if (e && !seen.has(e)) {
        list.push({ ...m, __role: 'member' });
        seen.add(e);
      }
    }

    return list;
  }

  // Returns true if this email has non-empty prefs (activities OR food OR budget)
  isDone(email?: string | null): boolean {
    if (!email) return false;
    const entry = this.prefsMap.get(String(email).toLowerCase());
    if (!entry || !entry.prefs) return false;
    const p = entry.prefs;
    return !!(p.activities?.length || p.food?.length || p.budget?.length);
  }

  // How many in the group are done
  doneCount(): number {
    return this.groupMembers().reduce((n, m) => n + (this.isDone(m.email) ? 1 : 0), 0);
  }

  // send request to generate outing in the backend
  async generateOuting() {
    const o = this.outing();
    if (!o) return;
    if (this.generating()) return;
    this.generating.set(true);
    console.log('Generating outing for outing ID:', o.id);

    try {
      const res = await fetch(`${API}/api/generate-outing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // For now just gotta send the outing ID; should be enough; TODO: include more if needed
        body: JSON.stringify({ outingId: o.id }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to generate outing');
      this.toast.success('Outing generated successfully!');

      await this.fetchGeneratedPlan(o.id);  //refersh 

    } catch (err: any) {
      this.toast.error(err?.message || 'Error generating outing');
      this.cdr.detectChanges();
    } finally {
      this.generating.set(false);
      this.cdr.detectChanges();
    }
  }
}
