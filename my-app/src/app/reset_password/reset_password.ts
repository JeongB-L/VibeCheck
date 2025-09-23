import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterModule],
  standalone: true,
  templateUrl: './reset_password.html',
  styleUrl: './reset_password.css',
})
export class ResetPassword {
  email: string = '';
  constructor(private router: Router) {}

  async onResetPassword() {
    try {
      console.log('Resetting password for email:', this.email);
      const res = await fetch('http://localhost:3001/api/reset_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email.trim().toLowerCase(),
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        alert(`Password reset failed: ${body.error ?? 'Unknown error'}`);
        return;
      }

      await this.router.navigate(['/login']);
    } catch (err: any) {
      alert(`Network error: ${err?.message ?? err}`);
    }
  }
}
