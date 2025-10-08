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

  newPassword: string = '';
  confirmPassword: string = '';

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

  async changePassword() {
    if (!this.newPassword) {
      this.toastr.error('Please enter a new password');
      return;
    }

    if (this.newPassword.length < 8) {
      this.toastr.error('New password must be at least 8 characters long');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.toastr.error('New passwords do not match');
      return;
    }

    try {
      const res = await fetch(`${API}/api/update_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email(),
          newPassword: this.newPassword,
        }),
      });

      const body = await res.json();

      if (res.ok) {
        this.toastr.success('Password changed successfully');
        this.newPassword = '';
        this.confirmPassword = '';
      } else {
        this.toastr.error(body.error || 'Failed to change password');
      }
    } catch (e) {
      this.toastr.error('Server error');
    }
  }
}
