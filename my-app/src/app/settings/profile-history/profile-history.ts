import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../../header/header';

const API = 'http://localhost:3001';

@Component({
  selector: 'app-profile-history',
  standalone: true,
  imports: [CommonModule, HeaderComponent, DatePipe],
  templateUrl: './profile-history.html',
  styleUrl: './profile-history.css',
})
export class ProfileHistory implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');
  firstName = signal<string>('');
  lastName = signal<string>('');
  profileHistory = signal<any[]>([]);
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
    if (!this.email()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadMe();
    this.loadProfileHistory();
  }

  async loadMe() {
    const res = await fetch(`${API}/api/profile/me?email=${encodeURIComponent(this.email())}`);
    const body = await res.json();

    if (res.ok) {
      this.firstName.set(body?.first_name ?? '');
      this.lastName.set(body?.last_name ?? '');
    }
  }

  async loadProfileHistory() {
    this.loadingProfileHistory.set(true);
    try {
      const res = await fetch(
        `${API}/api/profile/history?email=${encodeURIComponent(this.email())}`
      );
      const body = await res.json();
      if (res.ok) {
        this.profileHistory.set(body.history || []);
      } else {
        this.toastr.error(body?.error ?? 'Could not load history', 'Error');
      }
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Network error', 'Error');
    } finally {
      this.loadingProfileHistory.set(false);
    }
  }

  async restoreProfileVersion(historyId: number) {
    if (!confirm('Restore this version? This will overwrite your current profile.')) return;
    try {
      const res = await fetch(`${API}/api/profile/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email(), history_id: historyId }),
      });
      const body = await res.json();
      if (res.ok) {
        this.toastr.success('Profile restored.', 'Success');
        this.loadProfileHistory();
      } else {
        this.toastr.error(body?.error ?? 'Restore failed', 'Error');
      }
    } catch (e: any) {
      this.toastr.error(e?.message ?? 'Network error', 'Error');
    }
  }
}
