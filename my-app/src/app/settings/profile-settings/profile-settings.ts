import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

const API = 'http://localhost:3001';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.css',
})
export class ProfileSettings implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');
  firstName = signal<string>('');
  lastName = signal<string>('');
  avatarUrl: string | null = null;
  selected?: File;

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
    if (res.ok) this.avatarUrl = body?.profile?.avatar_url ?? null;
    this.firstName.set(body?.first_name ?? '');
    this.lastName.set(body?.last_name ?? '');
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
}
