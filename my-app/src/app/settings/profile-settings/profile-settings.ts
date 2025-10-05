import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../../header/header';
import { DatePipe } from '@angular/common'; // Add this for date formatting

const API = 'http://localhost:3001';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule, HeaderComponent, DatePipe], // Add DatePipe to imports
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.css',
})
export class ProfileSettings implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');

  firstName = signal<string>('');
  lastName = signal<string>('');
  avatarUrl: string | null = null;
  selected?: File;

  about = signal<string>('');
  editingBio = signal<boolean>(false);
  tempBio = signal<string>('');
  savingBio = signal<boolean>(false);
  preferences = signal<string[]>([]);

  // Profile History signals
  profileHistory = signal<any[]>([]);
  showProfileHistory = signal<boolean>(false);
  loadingProfileHistory = signal<boolean>(false);

  constructor(private router: Router, private toastr: ToastrService) {}

  fullName = computed(() => {
    const parts = [this.firstName().trim(), this.lastName().trim()].filter(Boolean);
    return parts.join(' ');
  });

  initial = computed(() => {
    const e = this.email().trim();
    const name = e.split('@')[0] || 'U';
    return (name[0] || 'U').toUpperCase();
  });

  ngOnInit(): void {
    if (!this.email()) this.router.navigate(['/login']);
    this.loadMe();
  }

  async loadMe() {
    const res = await fetch(`${API}/api/profile/me?email=${encodeURIComponent(this.email())}`);
    const body = await res.json();

    if (res.ok) {
      this.avatarUrl = body?.profile?.avatar_url ?? null;
      this.firstName.set(body?.first_name ?? '');
      this.lastName.set(body?.last_name ?? '');
      this.about.set(body?.profile?.bio ?? '');

      const prefs = body?.profile?.preferences ?? body?.preferences ?? [];
      if (Array.isArray(prefs)) {
        this.preferences.set(prefs.filter((x: any) => typeof x === 'string'));
      }
    }
  }

  backHome() {
    this.router.navigate(['/homepage']);
  }

  openPicker(input: HTMLInputElement) {
    input.click();
  }

  async onFileChange(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;

    // Validate type & size (mirror backend rules)
    const typeOk = /^image\/(png|jpe?g|webp)$/i.test(f.type);
    const sizeOk = f.size <= 5 * 1024 * 1024; // 5MB

    if (!typeOk) {
      this.toastr.error('Only PNG, JPG, or WEBP images are allowed.', 'Invalid file type');
      return;
    }
    if (!sizeOk) {
      this.toastr.error('Image is too large (max 5MB).', 'File too big');
      return;
    }

    const fd = new FormData();
    fd.append('email', this.email());
    fd.append('file', f);

    try {
      const res = await fetch(`${API}/api/profile/avatar`, { method: 'POST', body: fd });
      let body: any = {};
      try {
        body = await res.json();
      } catch {}

      if (!res.ok) {
        this.toastr.error(body?.error ?? 'Upload failed', 'Error');
        return;
      }

      this.avatarUrl = body.avatar_url ?? null;
      this.toastr.success('Profile picture updated.', 'Success');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Network error', 'Error');
    }
  }

  startEditBio() {
    this.tempBio.set(this.about());
    this.editingBio.set(true);
  }

  cancelEditBio() {
    this.editingBio.set(false);
    this.tempBio.set(this.about());
  }

  async saveBio() {
    const bio = this.tempBio().trim();
    this.savingBio.set(true);
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email(),
          bio,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.toastr.error(body?.error ?? 'Could not save bio', 'Error');
        return;
      }

      this.about.set(bio);
      this.editingBio.set(false);
      this.toastr.success('Bio updated.', 'Success');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Network error', 'Error');
    } finally {
      this.savingBio.set(false);
    }
  }

  // --- Preferences logic ---
  addPref(raw: string) {
    const v = (raw || '').trim();
    if (!v) return;
    const current = this.preferences();
    if (current.some((p) => p.toLowerCase() === v.toLowerCase())) {
      this.toastr.info('Already added.', 'Preference');
      return;
    }
    this.preferences.set([...current, v]);
  }

  removePref(i: number) {
    const arr = this.preferences().slice();
    if (i >= 0 && i < arr.length) {
      arr.splice(i, 1);
      this.preferences.set(arr);
    }
  }

  async savePrefs() {
    try {
      const res = await fetch(`${API}/api/profile/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email(),
          preferences: this.preferences(),
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.toastr.error(body?.error ?? 'Could not save preferences', 'Error');
        return;
      }
      this.toastr.success('Preferences saved.', 'Success');
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Network error', 'Error');
    }
  }
}
