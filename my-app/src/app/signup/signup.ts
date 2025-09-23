import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';

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

  constructor(private router: Router) {}

  async onSignup() {
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
        alert(`Signup failed: ${body.error ?? 'Unknown error'}`);
        return;
      }

      // Redirect to /verify with the email
      this.router.navigate(['/verify'], {
        queryParams: { email: body.user?.email ?? this.email.trim().toLowerCase() },
      });
    } catch (err: any) {
      alert(`Network error: ${err?.message ?? err}`);
    } finally {
      this.loading = false;
    }
  }
}
