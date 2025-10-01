import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../header/header';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPage {
  menuOpen = signal(false);
  userId = sessionStorage.getItem('userId') || '';

  constructor(private router: Router) {}

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
