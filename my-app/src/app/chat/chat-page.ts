import { Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../header/header';
import { ToastrService } from 'ngx-toastr';

type Sender = {
  user_id: string;
  email?: string;
  name?: string;
  display_name?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
};

type Msg = {
  id: number;
  thread_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender?: Sender;
};

type ThreadRow = {
  thread_id: number;
  other_user: Sender & {
    email: string;
  };
  last_message_at?: string | null;
  last_message?: any;
  unread_count?: number;
};

const API = 'http://localhost:3001/api';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.css',
})
export class ChatPage implements OnInit {
  // public signals for template
  draft = signal<string>('');
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  messages = signal<Msg[]>([]);
  threadId = signal<number | null>(null);
  friendEmail = signal<string | null>(null);

  // peer (who I’m texting)
  peerDisplayName = signal<string | null>(null);
  peerEmail = signal<string | null>(null);
  peerAvatarUrl = signal<string | null>(null);

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
    const qp = this.route.snapshot.queryParamMap;
    const threadParam = qp.get('threadId');
    const friend = qp.get('friendEmail');

    if (!this.meEmail) {
      this.error.set('Not signed in');
      return;
    }

    try {
      this.loading.set(true);

      if (threadParam) {
        const tid = Number(threadParam);
        if (!tid) {
          this.error.set('threadId is required');
          return;
        }
        this.threadId.set(tid);
        await this.loadPeerFromThreadsByThreadId(tid);
      } else if (friend) {
        const normalized = friend.trim().toLowerCase();
        this.friendEmail.set(normalized);
        this.peerEmail.set(normalized);
        const createdTid = await this.ensureThread(this.meEmail, normalized);
        this.threadId.set(createdTid);
        await this.loadPeerFromThreadsByThreadId(createdTid);
      } else {
        this.error.set('friendEmail or threadId is required');
        return;
      }

      await this.loadMessages();
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to initialize chat');
    } finally {
      this.loading.set(false);
    }
  }

  trackById(_i: number, m: Msg) {
    return m.id;
  }

  private async ensureThread(meEmail: string, friendEmail: string): Promise<number> {
    const res = await fetch(`${API}/chat/thread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meEmail, friendEmail }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'Failed to create thread');
    return Number(body?.thread?.id);
  }

  private async loadPeerFromThreadsByThreadId(tid: number) {
    try {
      const res = await fetch(`${API}/chat/threads?email=${encodeURIComponent(this.meEmail)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load threads');

      const rows: ThreadRow[] = body?.threads || [];
      const row = rows.find((r) => r.thread_id === tid);
      if (row?.other_user) {
        const ou = row.other_user;
        this.peerDisplayName.set(ou.display_name || ou.name || null);
        this.peerEmail.set(ou.email || this.friendEmail() || null);
        this.peerAvatarUrl.set(ou.avatar_url || ou.avatar_path || null);
      } else {
        if (!this.peerEmail()) this.peerEmail.set(this.friendEmail());
      }
    } catch {}
  }

  async loadMessages() {
    const tid = this.threadId();
    if (!tid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${API}/chat/messages?threadId=${encodeURIComponent(String(tid))}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not load messages');
      this.messages.set(body?.messages || []);

      setTimeout(() => this.scrollToBottomOnce(), 0);

      await this.markReadUpToLast();
    } catch (e: any) {
      this.error.set(e?.message || 'Network error');
    } finally {
      this.loading.set(false);
    }
  }

  async send() {
    const text = (this.draft() || '').trim();
    const tid = this.threadId();
    if (!text || !tid) return;

    try {
      const res = await fetch(`${API}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meEmail: this.meEmail,
          threadId: tid,
          body: text,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to send');

      const arr = this.messages().slice();
      arr.push(body.message as Msg);
      this.messages.set(arr);
      this.draft.set('');

      setTimeout(() => {
        if (this.isUserNearBottom()) {
          this.scrollToBottom();
        }
      }, 0);

      await this.markReadUpToLast();
    } catch (e: any) {
      this.toastr.error(e?.message || 'Send failed', 'Chat');
    }
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

    const threshold = 120; // px from bottom
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom < threshold;
  }

  onPeerImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && img.src.indexOf('assets/default_pfp.jpg') === -1) {
      img.src = 'assets/default_pfp.jpg';
    }
  }

  private async markReadUpToLast() {
    const tid = this.threadId();
    const lastId = this.messages().at(-1)?.id;
    if (!tid || !lastId) return;

    try {
      await fetch(`http://localhost:3001/api/chat/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meEmail: this.meEmail,
          threadId: tid,
          upToMessageId: lastId,
        }),
      });
    } catch {}
  }

  @ViewChild('scroller') scroller!: ElementRef<HTMLDivElement>;

  private scrollToBottomOnce() {
    try {
      const el = this.scroller?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {}
  }
}
