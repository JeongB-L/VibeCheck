import { Component, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

const BACKEND = 'http://localhost:3001'; // adjust if needed

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verify-email.html',
  styleUrls: ['./verify-email.css'],
})
export class VerifyEmailComponent implements OnInit {
  email = '';
  codeDigits = ['', '', '', '', '', ''];
  loading = false;
  error = '';
  successView = false;
  countdown = 3;
  private t?: any;

  @ViewChildren('otpInput') inputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.email = qp.get('email') ?? '';
    setTimeout(() => this.inputs?.first?.nativeElement?.focus(), 0);
  }

  ngOnDestroy(): void {
    if (this.t) clearInterval(this.t);
  }

  get code() {
    return this.codeDigits.join('');
  }

  onInput(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, '').slice(0, 1);
    this.codeDigits[i] = el.value;
    if (el.value && i < this.inputs.length - 1) this.inputs.get(i + 1)?.nativeElement?.focus();
  }
  onKeydown(i: number, ev: KeyboardEvent) {
    const el = this.inputs.get(i)?.nativeElement!;
    if (ev.key === 'Backspace' && !el.value && i > 0)
      this.inputs.get(i - 1)?.nativeElement?.focus();
  }
  onPaste(ev: ClipboardEvent) {
    ev.preventDefault();
    const digits = (ev.clipboardData?.getData('text') ?? '')
      .replace(/\D/g, '')
      .slice(0, 6)
      .split('');
    for (let i = 0; i < 6; i++) {
      this.codeDigits[i] = digits[i] ?? '';
      const box = this.inputs.get(i)?.nativeElement;
      if (box) box.value = this.codeDigits[i];
    }
  }

  async onVerify() {
    this.error = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.error = 'Enter a valid email.';
      return;
    }
    if (!/^\d{6}$/.test(this.code)) {
      this.error = 'Enter the 6-digit code.';
      return;
    }

    this.loading = true;
    try {
      const res = await fetch(`${BACKEND}/api/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, code: this.code }),
      });
      const body = await res.json();
      if (!res.ok) {
        this.error = body.error ?? 'Verification failed.';
        return;
      }

      // success screen with 3s redirect
      this.successView = true;
      this.countdown = 3;
      this.t = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          clearInterval(this.t);
          this.router.navigateByUrl('/login');
        }
      }, 1000);
    } catch (e: any) {
      this.error = e?.message ?? 'Network error.';
    } finally {
      this.loading = false;
    }
  }

  goNow() {
    if (this.t) clearInterval(this.t);
    this.router.navigateByUrl('/login');
  }
}
