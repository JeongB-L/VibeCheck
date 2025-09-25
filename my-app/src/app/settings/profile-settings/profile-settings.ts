import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

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
  avatarUrl: string | null = null;
  selected?: File;

  constructor(private router: Router) {}

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
    this.selected = f;

    const fd = new FormData();
    fd.append('email', this.email());
    fd.append('file', f);

    const res = await fetch(`${API}/api/profile/avatar`, { method: 'POST', body: fd });
    const body = await res.json();
    if (!res.ok) {
      alert(body?.error ?? 'Upload failed');
      return;
    }
    this.avatarUrl = body.avatar_url ?? null;
    this.selected = undefined;
  }
}
