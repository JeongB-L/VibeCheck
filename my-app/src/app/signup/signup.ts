import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

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

  async onSignup() {
    try {
      const res = await fetch('http://localhost:3001/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email.trim().toLowerCase(),
          password: this.password
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        alert(`Signup failed: ${body.error ?? 'Unknown error'}`);
        return;
      }

      alert(`Saved: ${body.user.email}`);
    } catch (err: any) {
      alert(`Network error: ${err?.message ?? err}`);
    }
  }
}
