import { Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';

type OutingSender = {
  user_id: string;
  email?: string;
  name?: string;
  display_name?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
};

type OutingMsg = {
  id: number;
  outing_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: OutingSender;
};

const API = 'http://localhost:3001/api';

@Component({
  selector: 'app-outing-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './outing-chat-page.html',
  styleUrl: './outing-chat-page.css',
})
export class OutingChatPage implements OnInit {
  draft = signal<string>('');
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  messages = signal<OutingMsg[]>([]);

  outingId = signal<string | null>(null);
  outingTitle = signal<string | null>(null);

  @ViewChild('scroller') scroller!: ElementRef<HTMLDivElement>;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService
  ) {}

  get meEmail(): string {
    return sessionStorage.getItem('userEmail') || '';
  }
  get meUserId(): string {
    return sessionStorage.getItem('userId') || '';
  }

  async ngOnInit() {
    if (!this.meEmail) {
      this.error.set('Not signed in');
      return;
    }

    // Route: /outings/:id/chat  (see routing snippet later)
    const id = this.route.snapshot.paramMap.get('id');
    const title = this.route.snapshot.queryParamMap.get('title');

    if (!id) {
      this.error.set('outingId is required');
      return;
    }

    this.outingId.set(id);
    if (title) this.outingTitle.set(title);

    await this.loadMessages();
  }

  trackById(_i: number, m: OutingMsg) {
    return m.id;
  }

  private scrollToBottom() {
    try {
      const el = this.scroller?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  private isUserNearBottom(): boolean {
    const el = this.scroller?.nativeElement;
    if (!el) return true;

    const threshold = 120;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom < threshold;
  }

  async loadMessages() {
    const oid = this.outingId();
    if (!oid) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const res = await fetch(`${API}/chat/outing-messages?outingId=${encodeURIComponent(oid)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not load messages');

      this.messages.set(body?.messages || []);

      setTimeout(() => this.scrollToBottom(), 0);
    } catch (e: any) {
      this.error.set(e?.message || 'Network error');
    } finally {
      this.loading.set(false);
    }
  }

  async send() {
    const text = (this.draft() || '').trim();
    const oid = this.outingId();
    if (!text || !oid) return;

    try {
      const res = await fetch(`${API}/chat/outing-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meEmail: this.meEmail,
          outingId: oid,
          body: text,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to send');

      const arr = this.messages().slice();
      arr.push(body.message as OutingMsg);
      this.messages.set(arr);
      this.draft.set('');
      setTimeout(() => {
        if (this.isUserNearBottom()) {
          this.scrollToBottom();
        }
      }, 0);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Send failed', 'Outing Chat');
    }
  }

  onSenderImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && img.src.indexOf('assets/default_pfp.jpg') === -1) {
      img.src = 'assets/default_pfp.jpg';
    }
  }
}
