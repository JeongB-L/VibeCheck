import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

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
  constructor(private router: Router, private toastr: ToastrService) {}

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
        if (body?.code === 'NOT_VERIFIED') {
          this.toastr.info('Please verify your email to continue.', 'Check your inbox');
          // prefill the verify page with the email we just used
          this.router.navigate(['/verify'], {
            queryParams: { email: body?.user?.email ?? this.email.trim().toLowerCase() },
          });
        } else {
          this.toastr.error(body?.error ?? 'Login failed', 'Error');
        }
        return;
      }

      const token = body?.token;
      
      if (typeof token === 'string' && token.length > 0) {
        sessionStorage.setItem('authToken', token);
        if (body?.user?.email) sessionStorage.setItem('userEmail', body.user.email);
        if (body?.user?.user_id) {
            sessionStorage.setItem('userId', body.user.user_id);  // DB key
  }
      } else {
        console.warn('Login succeeded but no token found in response:', body);
      }

      // alert(`Welcome, ${body.user.email}!`);
      await this.router.navigate(['/homepage']);
    } catch (err: any) {
      this.toastr.error(err?.message ?? String(err), 'Network error');
    }
  }
}