import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterModule],
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  email = '';
  password = '';
  constructor(private router: Router) {}

  async onLogin() {
    try {
      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email.trim().toLowerCase(),
          password: this.password,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        alert(body.error ?? 'Login failed');
        return;
      }

      // alert(`Welcome, ${body.user.email}!`);
      await this.router.navigate(['/homepage']);
    } catch (err: any) {
      alert(`Network error: ${err?.message ?? err}`);
    }
  }
}
