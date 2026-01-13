import { Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-shared-outing',
  templateUrl: './shared-outing.page.html',
  styleUrl: './shared-outing.page.css',
  imports: [CommonModule],
})
export class SharedOutingPage {
  outing = signal<any>(null);
  plan = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(private route: ActivatedRoute) {}

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');

    if (!token) return;

    try {
      const res = await fetch(`http://localhost:3001/api/public/share/${token}`);

      const body = await res.json();

      if (!res.ok) throw new Error(body?.error || 'Failed');

      this.outing.set(body.outing);
      this.plan.set(body.plan);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load outing');
    } finally {
      this.loading.set(false);
    }
  }
}
