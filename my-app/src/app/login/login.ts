import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AfterViewInit } from '@angular/core';

declare global {
  interface Window {
    google?: any;
  }
}
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterModule],
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements AfterViewInit {
  email = '';
  password = '';
  constructor(private router: Router, private toastr: ToastrService) {}
  private triedReactivation = false;

  async onLogin() {
    try {
      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email.trim().toLowerCase(),
          password: this.password,
        }),
        credentials: 'include'
      });

      const body = await res.json();

      if (!res.ok) {
        if (body?.code === 'NOT_VERIFIED') {
          this.toastr.info('Please verify your email to continue.', 'Check your inbox');
          // prefill the verify page with the email we just used
          this.router.navigate(['/verify'], {
            queryParams: { email: body?.user?.email ?? this.email.trim().toLowerCase() },
          });
        } else if (body?.code === 'ACCOUNT_DEACTIVATED' && !this.triedReactivation) {
            const ok = confirm('Your account is deactivated. Reactivate now using the info you just entered?');
            if (ok) {
              try {
                const rx = await fetch('http://localhost:3001/api/account/reactivate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: this.email.trim().toLowerCase(),
                    password: this.password,
                  }),
                  credentials: 'include',
                });
                const rxBody = await rx.json().catch(() => ({}));
                if (rx.ok) {
                  this.triedReactivation = true;   // avoid loops
                    this.triedReactivation = true;
                    await this.onLogin();   
                    return;                 
                } else {
                  this.toastr.error(rxBody?.error ?? 'Reactivation failed', 'Error');
                }
              } catch (e: any) {
                this.toastr.error(e?.message ?? String(e), 'Network error');
              }
            }
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

  ngAfterViewInit(): void {
    if (!document.getElementById('google-login-btn')) return;
    this.loadGoogleScript()
      .then(() => this.initGoogleButton())
      .catch(() => { });
}

private initGoogleButton(): void {
  if (!window.google) return;

  const CLIENT_ID = '34500308587-96dee426of565co5s9sqjnpbn8gs138k.apps.googleusercontent.com';

  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp: any) => {
      const idToken = resp?.credential;
      if (idToken) this.onGoogleCredential(idToken);
    },
    ux_mode: 'popup',
  });

  const mount = document.getElementById('google-login-btn');
  if (mount) {
    window.google.accounts.id.renderButton(mount, {
      type: 'standard',
      shape: 'rectangular',
      size: 'large',
      text: 'continue_with',
      logo_alignment: 'left',
      width: 320,
    });
  }
}

private async onGoogleCredential(idToken: string): Promise<void> {
  try {
    const url = 'http://localhost:3001/api/auth/google';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: idToken }),
      credentials: 'include', 
    });

    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      if (typeof body?.token === 'string' && body.token.length > 0) {
        sessionStorage.setItem('authToken', body.token);
      }
      if (body?.user?.email) sessionStorage.setItem('userEmail', body.user.email);
      if (body?.user?.user_id) sessionStorage.setItem('userId', body.user.user_id);

      this.router.navigate(['/homepage']);
    } else {
      this.toastr?.error(body?.error ?? 'Google sign-in failed', 'Error');
    }
  } catch (e: any) {
    this.toastr?.error(e?.message ?? String(e), 'Network error');
  }
}

private loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-gis', '1');
    s.onload = () => resolve();
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
}
}