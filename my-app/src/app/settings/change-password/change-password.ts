// change-password.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../../header/header';

const API = 'http://localhost:3001';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePassword implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');
  firstName = signal<string>('');
  lastName = signal<string>('');

  currentPassword = '';
  newPassword: string = '';
  confirmPassword: string = '';

  showCurrent = false;
  showNew = false;
  showConfirm = false;
  saving = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  backHome() {
    this.router.navigate(['/homepage']);
  }

  ngOnInit(): void {
    if (!this.email()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadMe();
  }

  async loadMe() {
    const res = await fetch(`${API}/api/profile/me?email=${encodeURIComponent(this.email())}`);
    const body = await res.json();

    if (res.ok) {
      this.firstName.set(body?.first_name ?? '');
      this.lastName.set(body?.last_name ?? '');
    }
  }

  currentPasswordError(): string | null {
    if (!this.currentPassword) return null;
    if (this.currentPassword.length < 1) return 'Please enter your current password.';
    return null;
  }
  newPasswordError(): string | null {
    if (!this.newPassword) return null;
    if (this.newPassword.length < 8) return 'Password must be at least 8 characters.';
    return null;
  }
  confirmPasswordError(): string | null {
    if (!this.confirmPassword) return null;
    if (this.newPassword && this.confirmPassword !== this.newPassword)
      return 'Passwords do not match.';
    return null;
  }
  isFormValid(): boolean {
    return (
      !!this.currentPassword &&
      !!this.newPassword &&
      !!this.confirmPassword &&
      this.newPassword.length >= 8 &&
      this.newPassword === this.confirmPassword
    );
  }

  async changePassword() {
    if (!this.isFormValid()) return;
    this.saving = true;
    try {
      const res = await fetch(`${API}/api/update_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email(),
          currentPassword: this.currentPassword,
          newPassword: this.newPassword,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        this.toastr.success('Password changed successfully');
        this.currentPassword = this.newPassword = this.confirmPassword = '';
      } else if (res.status === 401) {
        this.toastr.error('Current password is incorrect');
      } else {
        this.toastr.error(body?.error || 'Failed to change password');
      }
    } catch {
      this.toastr.error('Server error');
    } finally {
      this.saving = false;
    }
  }
}
