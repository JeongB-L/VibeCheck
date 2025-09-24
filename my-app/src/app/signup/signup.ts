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
  firstName = '';
  lastName = '';
  dob = '';
  gender = '';
  email = '';
  password = '';
  loading = false;

  constructor(private router: Router, private toastr: ToastrService) {}

  async onSignup() {
    if (this.loading) return;
    this.loading = true;

    try {
      const payload = {
        email: this.email.trim().toLowerCase(),
        password: this.password,
        first_name: this.firstName.trim(),
        last_name: this.lastName.trim(),
        date_of_birth: this.dob,
        gender: this.gender || null, // null if not selected
      };

      const res = await fetch('http://localhost:3001/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        if (body?.code === 'EXISTS_VERIFIED') {
          this.toastr.warning('Email already exists. Please log in.', 'Already verified');
          this.router.navigate(['/login'], { queryParams: { email: payload.email } });
        } else {
          this.toastr.error(body?.error ?? 'Unknown error', 'Sign up failed');
        }
        return;
      }

      this.toastr.info('We sent you a verification code.', 'Check your email');
      this.router.navigate(['/verify'], {
        queryParams: { email: body.user?.email ?? payload.email },
      });
    } catch (err: any) {
      this.toastr.error(err?.message ?? String(err), 'Network error');
    } finally {
      this.loading = false;
    }
  }
}
