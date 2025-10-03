import { CommonModule } from '@angular/common';
import { Component, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../header/header';
import { Router } from '@angular/router';


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

@Component({
  selector: 'app-outings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './outings.html',
  styleUrl: './outings.css',
})
export class Outings implements OnInit {
  outings: Outing[] = [];

  // UI state
  showForm = false;
  isSubmitting = false;

  menuForId: number | null = null;

  // form fields
  title = '';
  location = '';
  start = '';
  end = '';

  constructor(private toast: ToastrService, private router: Router) {}

  goDetail(id: number) { this.router.navigate(['/outings', id]); }


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
  }

  // ---------- helpers ----------
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
    } catch (e: any) {
      console.error('Fetch outings error:', e);
      this.toast.error(e?.message ?? 'Load error', 'Outings');
    }
  }

  // ---------- CREATE ----------
  async createOuting(): Promise<void> {
    if (!this.userEmail) {
      this.toast.error('Not signed in', 'Create Outing');
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
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create');

      this.toast.success('Outing created');
      this.title = this.location = this.start = this.end = '';
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
