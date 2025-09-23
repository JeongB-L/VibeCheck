import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterModule],
  standalone: true,
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})

export class Signup {
  email: string = '';
  password: string = '';
  loading = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  async onSignup() {
    if (this.loading) return;
    this.loading = true;

    try {
      const res = await fetch('http://localhost:3001/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email.trim().toLowerCase(),
          password: this.password,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        // Common special-cases from your backend
        if (body?.code === 'EXISTS_VERIFIED') {
          this.toastr.warning('Email already exists. Please log in.', 'Already verified');
        } else {
          this.toastr.error(body?.error ?? 'Unknown error', 'Sign up failed');
        }
        return;
      }

      this.toastr.info('We sent you a new verification code.', 'Check your email');

      this.router.navigate(['/verify'], {
        queryParams: { email: body.user?.email ?? this.email.trim().toLowerCase() },
      });
    } catch (err: any) {
      this.toastr.error(err?.message ?? String(err), 'Network error');
    } finally {
      this.loading = false;
    }
  }

}
