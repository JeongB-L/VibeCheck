import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../header/header';
import { InactivityService } from '../inactivity/inactivity.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPage implements OnInit {
  menuOpen = signal(false);
  userId = sessionStorage.getItem('userId') || '';
  userEmail = sessionStorage.getItem('userEmail') || '';

  // actual server-backed minutes (number or null if unset/unknown)
  timeoutMinutes = signal<number | null>(null);

  // UI state
  isLoading = signal(true); // separate loading flag
  inputStr = signal<string>(''); // what the user is typing

  // enable the Save button only when the current input is a valid number
  validNumber = computed(() => {
    const v = Number(this.inputStr());
    return Number.isFinite(v) && v > 0 && v <= 720;
  });

  constructor(private router: Router, private inactivity: InactivityService) {}

  ngOnInit() {
    this.loadTimeout();
  }

  private async loadTimeout() {
    this.isLoading.set(true);
    try {
      if (!this.userEmail) {
        this.timeoutMinutes.set(null);
        this.inputStr.set('');
        return;
      }

      const res = await fetch(
        `http://localhost:3001/api/profile/me?email=${encodeURIComponent(this.userEmail)}`
      );
      const body = await res.json();
      if (res.ok) {
        const mins = Number(body?.profile?.idle_timeout_minutes);
        if (Number.isFinite(mins) && mins > 0) {
          const m = Math.floor(mins);
          this.timeoutMinutes.set(m);
          this.inputStr.set(String(m)); // input box
          this.inactivity.setTimeoutMinutes(m);
        } else {
          this.timeoutMinutes.set(null);
          this.inputStr.set(''); // leave blank for user to type
        }
      } else {
        this.timeoutMinutes.set(null);
        this.inputStr.set('');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  onTimeoutInput(raw: string) {
    this.inputStr.set(raw);
  }

  async saveTimeout() {
    if (!this.validNumber()) {
      alert('Enter a valid number of minutes (1–720).');
      return;
    }

    const v = Math.max(1, Math.floor(Number(this.inputStr())));
    const res = await fetch(`http://localhost:3001/api/profile/idle-timeout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.userEmail, minutes: v }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body?.error || 'Failed to save timeout');
      return;
    }

    this.timeoutMinutes.set(v);
    this.inputStr.set(String(v));
    this.inactivity.setTimeoutMinutes(v);
  }

  // header actions
  toggleMenu() {
    this.menuOpen.update((v) => !v);
  }
  closeMenu() {
    this.menuOpen.set(false);
  }
  goMyOutings() {
    this.router.navigate(['/outings']);
  }
  goProfile() {
    this.closeMenu();
    this.router.navigate(['/settings/profile']);
  }
  goSettings() {
    /* already here */
  }
  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userId');
    this.closeMenu();
    this.router.navigate(['/login']);
  }

  // destructive action
  async deactivateAccount() {
    // NOTE: per your requirement, this performs a HARD DELETE
    const confirmText = prompt(
      'Type DELETE to permanently remove your account and all associated data.'
    );
    if (confirmText !== 'DELETE') return;

    const password = prompt('Enter your password to confirm deletion:');
    if (!password) return;

    try {
      const resp = await fetch('http://localhost:3001/api/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          // replace with your real auth header; using x-user-id for dev:
          'x-user-id': this.userId,
        },
        body: JSON.stringify({ password, confirm: 'DELETE' }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data?.error || 'Failed to delete account.');
        return;
      }

      // logout locally
      sessionStorage.clear();
      this.router.navigate(['/login']);
    } catch (e) {
      alert('Network error while deleting account.');
    }
  }
}
