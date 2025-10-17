import { CommonModule } from '@angular/common';
import { Component, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../header/header';
import { Router } from '@angular/router';
import { PlacesService, PlaceLite } from '../places.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

const API = 'http://localhost:3001';

type Outing = {
  id: number; // bigserial in DB
  title: string;
  location: string;
  start_date: string; // yyyy-mm-dd
  end_date: string; // yyyy-mm-dd
  creator_id: string; // uuid
  created_at: string; // timestamptz
};

type MemberLite = {
  user_id: string;
  avatar_url?: string | null;
  name?: string | null;
  role?: 'member' | 'admin';
};

@Component({
  selector: 'app-outings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './outings.html',
  styleUrl: './outings.css',
})
export class Outings implements OnInit {

  pendingInvites: Array<{
  id: number;
  status: string;
  created_at: string;
  outing: { id: number; title: string; location: string; start_date: string; end_date: string } | null;
  inviter: { email: string; display_name?: string | null; name?: string; avatar_path?: string | null };
}> = [];
invitesLoading = false;

  membersByOuting: Record<number, MemberLite[]> = {};

  outings: Outing[] = [];

  // UI state
  showForm = false;
  isSubmitting = false;

  menuForId: number | null = null;
  confirmId: number | null = null;
  confirmTitle = ''

  // form fields
  title = '';
  location = '';
  start = '';
  end = '';
  //autocomplete state
  locOpen = false;
  locLoading = false;
  locResults: PlaceLite[] = [];
  private locQuery$ = new Subject<string>();

  selectedPlace: PlaceLite | null = null;
  locTouched = false;

  constructor(private toast: ToastrService, private router: Router, public places: PlacesService) { }

  goDetail(id: number) { this.router.navigate(['/outings', id]); }

  // open the confirm dialog
  openDeleteConfirm(o: Outing, ev?: MouseEvent) {
    ev?.stopPropagation();
    this.menuForId = null; // close kebab
    this.confirmId = o.id;
    this.confirmTitle = o.title;
    document.body.classList.add('no-scroll');
  }

  // close the confirm dialog
  closeDeleteConfirm() {
    this.confirmId = null;
    this.confirmTitle = '';
    document.body.classList.remove('no-scroll');
  }

  // confirm → call existing deleter
  async confirmDelete() {
    if (this.confirmId == null) return;
    const id = this.confirmId;
    this.closeDeleteConfirm();
    await this.deleteOuting(id);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    const target = ev.target as HTMLElement;
    if (!target.closest('.kebab') && !target.closest('.menu')) {
      this.menuForId = null;
    }
  }

  ngOnInit(): void {
    // Debug: Check what's in session storage
    console.log('Session storage userId:', sessionStorage.getItem('userId'));
    console.log('Session storage userEmail:', sessionStorage.getItem('userEmail'));
    console.log('Computed userEmail:', this.userEmail);

    // Check if we have userEmail, if not redirect to login
    if (!this.userEmail) {
      this.toast.error('Please log in to view outings');
      // Redirect to login page
      window.location.href = '/login';
      return;
    }

    this.fetchOutings();
    this.loadMyInvites()


    // ---------- wire autocomplete stream ---------- // ADD
    this.locQuery$
      .pipe(debounceTime(180), distinctUntilChanged())
      .subscribe(async (q) => {
        if (!q || q.length < 2) {
          this.locResults = [];
          this.locOpen = false;
          return;
        }
        this.locLoading = true;
        try {
          const data = await this.places.autocomplete(q);
          this.locResults = data.places ?? [];
          this.locOpen = this.locResults.length > 0;
        } catch {
          this.locResults = [];
          this.locOpen = false;
        } finally {
          this.locLoading = false;
        }
      });
  }

  // ---------- helpers ----------
  // ---------- handlers for the Destination field ---------- // ADD
  public onLocationInput(v: string) {
    this.location = v;
    this.locOpen = !!v;
    this.locTouched = true;
    this.selectedPlace = null;
    this.locQuery$.next(v);
  }

  public onLocFocus(): void {
    this.locOpen = this.locResults.length > 0;
  }

  public onLocBlur(): void {
    this.locTouched = true;
    // let click on a suggestion register
    window.setTimeout(() => (this.locOpen = false), 150);
  }
  public onLocKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && this.locOpen && this.locResults.length) {
      ev.preventDefault();
      this.pickPlace(this.locResults[0]);
    }
  }

  pickPlace(p: PlaceLite) {
    this.selectedPlace = p;
    this.location = p.name;                  // or `${p.name}, ${p.address}` // ADD
    this.locOpen = false;
    this.locTouched = true;
    // If you want to persist coordinates/placeId later, store them here
    // this.selectedPlaceId = p.id;
    // this.selectedLat = p.lat; this.selectedLng = p.lng;
  }

  coverSrc(o: Outing): string {
    return `${API}/api/places/cover?q=${encodeURIComponent(o.location)}&w=900&h=400`;
  }

  coverFallback(ev: Event, id: number) {
    (ev.target as HTMLImageElement).src = `https://picsum.photos/seed/${id}/900/400`;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && img.src.indexOf(this.defaultAvatar) === -1) {
      img.src = this.defaultAvatar;
    }
  }

  inviteModalOuting: any = null;
  friends: any[] = [];
  friendsLoading = false;



  defaultAvatar = 'assets/default_pfp.jpg';

  avatarUrl(u: { avatar_path?: string | null }) {
    return u?.avatar_path || this.defaultAvatar;
  }

  // Load my pending invites
async loadMyInvites() {
  if (!this.userEmail) return;
  try {
    this.invitesLoading = true;
    const r = await fetch(`${API}/api/outings/invites?email=${encodeURIComponent(this.userEmail)}&status=pending`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b?.error || 'Failed to load invites');
    this.pendingInvites = b.invites || [];
  } catch (e: any) {
    console.error('loadMyInvites error:', e);
    this.toast.error(e?.message || 'Failed to load invites', 'Invites');
  } finally {
    this.invitesLoading = false;
  }
}

// Accept / Decline
async respondInvite(inviteId: number, action: 'accept' | 'decline') {
  try {
    const r = await fetch(`${API}/api/outings/invites/${inviteId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.userEmail, action }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b?.error || `Failed to ${action}`);

    if (action === 'accept') this.toast.success('Invite accepted');
    else this.toast.info('Invite declined');

    // refresh invites
    await this.loadMyInvites();

    // if accepted, the trigger added me to members → refresh members cache
    await this.fetchOutings();
  } catch (e: any) {
    console.error('respondInvite error:', e);
    this.toast.error(e?.message || 'Error handling invite');
  }
}

  async openInviteModal(o: any, ev: Event) {
    ev.stopPropagation();
    this.inviteModalOuting = o;
    this.loadFriends();
  }

  closeInviteModal() {
    this.inviteModalOuting = null;
    this.friends = [];
  }

  async loadFriends() {
    try {
      this.friendsLoading = true;
      const res = await fetch(`${API}/api/friends?email=${encodeURIComponent(this.userEmail || '')}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load friends');
      this.friends = body.friends || [];
    } catch (e) {
      console.error(e);
      this.toast.error('Failed to load friends');
    } finally {
      this.friendsLoading = false;
    }
  }

  // send invite
  async inviteFriend(friendEmail: string) {
    if (!this.inviteModalOuting) return;

    try {
      const r = await fetch(`${API}/api/outings/${this.inviteModalOuting.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviterEmail: this.userEmail,
          inviteeEmail: friendEmail
        })
      });

      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || 'Failed to invite');

      this.toast.success(`Invited ${friendEmail}`, 'Invite sent');
    } catch (e: any) {
      console.error('Invite failed:', e);
      this.toast.error(e?.message || 'Invite failed', 'Error');
    }
  }


  private get userEmail(): string | null {
    const v = sessionStorage.getItem('userEmail'); // set at login
    return v;
  }

  private headers(json = false): HeadersInit {
    const headers: HeadersInit = {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
    console.log('Request headers:', headers);
    return headers;
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
  }

  toggleMenu(id: number) {
    this.menuForId = this.menuForId === id ? null : id;
  }


  private validDates(): boolean {
    return !!this.start && !!this.end && new Date(this.start) <= new Date(this.end);
  }

  // ---------- READ ----------
  async fetchOutings(): Promise<void> {
    try {
      console.log('Fetching outings from:', `${API}/api/outings`);
      console.log('With userEmail:', this.userEmail);

      const res = await fetch(
        `${API}/api/outings?email=${encodeURIComponent(this.userEmail || '')}`,
        {
          headers: this.headers(),
        }
      );
      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);

      const body = await res.json().catch(() => ({}));
      console.log('Response body:', body);

      if (!res.ok) throw new Error(body?.error ?? 'Failed to load outings');
      this.outings = (body.outings ?? []) as Outing[];

      await Promise.all(
        this.outings.map(async (o) => {
          try {
            const r = await fetch(`${API}/api/outings/${o.id}/members`);
            const b = await r.json().catch(() => ({}));
            if (r.ok) this.membersByOuting[o.id] = (b.members || []) as MemberLite[];
          } catch { /* ignore */ }
        })
      );

    } catch (e: any) {
      console.error('Fetch outings error:', e);
      this.toast.error(e?.message ?? 'Load error', 'Outings');
    }
  }

  memberAvatars(o: Outing): MemberLite[] {
    return (this.membersByOuting[o.id] || []).slice(0, 5); // show up to 5
  }


  // ---------- CREATE ----------
  async createOuting(): Promise<void> {
    if (!this.userEmail) {
      this.toast.error('Not signed in', 'Create Outing');
      return;
    }

    // enforce selection from autocomplete
    if (!this.selectedPlace) {
      this.toast.warning('Please choose a destination from the suggestions.', 'Create Outing');
      // focus the field
      document.getElementById('location')?.focus();
      this.locTouched = true;
      return;
    }
    if (!this.title.trim() || !this.location.trim() || !this.validDates()) {
      this.toast.warning('Fill all fields with valid dates', 'Create Outing');
      return;
    }

    this.isSubmitting = true;
    try {
      const res = await fetch(`${API}/api/outings`, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({
          email: this.userEmail,
          title: this.title.trim(),
          location: this.location.trim(),
          start_date: this.start,
          end_date: this.end,
          // if you later want to store richer data:
          // place_id: this.selectedPlace.id, lat: this.selectedPlace.lat, lng: this.selectedPlace.lng
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create');

      this.toast.success('Outing created');
      this.title = this.location = this.start = this.end = '';
      this.selectedPlace = null;
      this.locResults = [];
      this.locTouched = false;
      this.showForm = false;
      await this.fetchOutings();
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Server error', 'Create Outing');
    } finally {
      this.isSubmitting = false;
    }
  }

  // ---------- UPDATE (optional) ----------
  async updateOuting(
    id: number,
    patch: Partial<Pick<Outing, 'title' | 'location' | 'start_date' | 'end_date'>>
  ): Promise<void> {
    if (!this.userEmail) {
      this.toast.error('Not signed in', 'Update Outing');
      return;
    }
    try {
      const res = await fetch(`${API}/api/outings/${id}`, {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify({
          email: this.userEmail,
          ...patch,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Update failed');
      this.toast.success('Outing updated');
      await this.fetchOutings();
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Server error', 'Update Outing');
    }
  }

  // ---------- DELETE ----------
  async deleteOuting(id: number): Promise<void> {
    if (!this.userEmail) {
      this.toast.error('Not signed in', 'Delete Outing');
      return;
    }
    try {
      const res = await fetch(
        `${API}/api/outings/${id}?email=${encodeURIComponent(this.userEmail || '')}`,
        {
          method: 'DELETE',
          headers: this.headers(),
        }
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Delete failed');
      }
      this.toast.success('Outing deleted');
      this.outings = this.outings.filter((o) => o.id !== id);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Server error', 'Delete Outing');
    }
  }
}
