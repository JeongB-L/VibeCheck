import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HeaderComponent } from '../header/header';
import { ToastrService } from 'ngx-toastr';

type Tab = 'current' | 'search' | 'pending' | 'messages';

interface FriendRow {
  user_id: string;
  email: string;
  name?: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

interface SuggestedUser extends FriendRow {
  has_mutual_outing?: boolean;
  match_reason?: string | null;
  requestState?: 'idle' | 'sent' | 'accepted';
}

interface ThreadRow {
  thread_id: number;
  last_message_at: string | null;
  unread_count: number;
  other_user: {
    user_id: string;
    email: string;
    display_name?: string | null;
    name?: string;
    avatar_path?: string | null;
  };
  last_message: null | {
    id: number;
    thread_id: number;
    sender_id: string;
    body: string;
    created_at: string;
  };
}

const API = 'http://localhost:3001/api';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './friends.html',
  styleUrl: './friends.css',
})
export class FriendsPage implements OnInit {
  tab = signal<Tab>('current');

  meEmail = sessionStorage.getItem('userEmail') || '';

  // state
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  // data
  friends = signal<FriendRow[]>([]);
  incoming = signal<FriendRow[]>([]);
  outgoing = signal<FriendRow[]>([]);
  threads = signal<ThreadRow[]>([]);

  // suggested friends
  suggested = signal<SuggestedUser[]>([]);
  suggestLoading = signal(false);
  suggestHasMore = signal(true);
  private suggestPage = signal(0);
  private readonly suggestPageSize = 24;

  // search/add
  searchEmail = signal<string>('');
  adding = signal(false);

  constructor(private router: Router, private toastr: ToastrService) {}

  async ngOnInit() {
    if (!this.meEmail) {
      this.router.navigate(['/login']);
      return;
    }
    await Promise.all([this.loadFriends(), this.loadPending(), this.loadOutgoing()]);
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'current') this.loadFriends();
    if (t === 'pending') {
      this.loadPending();
      this.loadOutgoing();
    }
    if (t === 'messages') {
      this.loadThreads();
    }
    if (t === 'search') {
      // refresh suggestions each time user visits discover tab
      this.loadSuggestions(true);
    }
  }

  // ------- Loaders -------
  async loadFriends() {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const res = await fetch(`${API}/friends?email=${encodeURIComponent(this.meEmail)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load friends');
      this.friends.set(body?.friends || []);
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Friends');
    } finally {
      this.loading.set(false);
    }
  }

  async loadPending() {
    try {
      const res = await fetch(`${API}/friends/pending?email=${encodeURIComponent(this.meEmail)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load pending');
      this.incoming.set(body?.incoming || []);
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Pending requests');
    }
  }

  async loadOutgoing() {
    try {
      const res = await fetch(`${API}/friends/outgoing?email=${encodeURIComponent(this.meEmail)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load outgoing');
      this.outgoing.set(body?.outgoing || []);
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Outgoing requests');
    }
  }

  // load threads list
  async loadThreads() {
    try {
      const res = await fetch(`${API}/chat/threads?email=${encodeURIComponent(this.meEmail)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load messages');
      this.threads.set(body?.threads || []);
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Messages');
    }
  }

  // suggestions
  async loadSuggestions(reset = false) {
    if (!this.meEmail) return;

    if (reset) {
      this.suggestPage.set(0);
      this.suggestHasMore.set(true);
      this.suggested.set([]);
    }
    if (!this.suggestHasMore()) return;

    this.suggestLoading.set(true);
    try {
      const limit = this.suggestPageSize;
      const offset = this.suggestPage() * limit;
      const url = `${API}/friends/suggestions?email=${encodeURIComponent(
        this.meEmail
      )}&limit=${limit}&offset=${offset}`;

      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load suggestions');

      const rows: SuggestedUser[] = (body?.users || []).map((u: any) => ({
        user_id: u.user_id,
        email: u.email,
        name: u.name,
        display_name: u.display_name,
        avatar_path: u.avatar_path,
        has_mutual_outing: u.has_mutual_outing,
        match_reason: u.match_reason,
        requestState: 'idle',
      }));

      if (!rows.length) {
        this.suggestHasMore.set(false);
        return;
      }

      if (reset) {
        this.suggested.set(rows);
      } else {
        this.suggested.update((prev) => [...prev, ...rows]);
      }

      this.suggestPage.update((p) => p + 1);

      const total = typeof body?.total === 'number' ? body.total : undefined;
      if (total !== undefined && this.suggested().length >= total) {
        this.suggestHasMore.set(false);
      }
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Friend suggestions');
      this.suggestHasMore.set(false);
    } finally {
      this.suggestLoading.set(false);
    }
  }

  loadMoreSuggestions() {
    this.loadSuggestions(false);
  }
  hasMoreSuggestions() {
    return this.suggestHasMore();
  }

  // ------- Actions -------
  async addFriend() {
    const f = this.searchEmail().trim().toLowerCase();
    if (!f) return;

    this.adding.set(true);
    this.errorMsg.set(null);
    try {
      const res = await fetch(`${API}/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail: f }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send request');

      this.searchEmail.set('');

      if (body?.state === 'accepted' || body?.autoAccepted) {
        // became friends immediately (mutual requests)
        await this.loadFriends();
        this.tab.set('current');
        this.toastr.success(`You're now friends with ${f}.`, 'Friend request accepted');
      } else {
        // normal pending outgoing
        await this.loadOutgoing();
        this.tab.set('pending');
        this.toastr.success(`Friend request sent to ${f}.`, 'Request sent');
      }
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    } finally {
      this.adding.set(false);
    }
  }

  async addFriendFromSuggestion(u: SuggestedUser) {
    if (u.requestState === 'sent' || u.requestState === 'accepted') return;
    this.adding.set(true);
    this.errorMsg.set(null);

    try {
      const res = await fetch(`${API}/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail: u.email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send request');

      const accepted = body?.state === 'accepted' || body?.autoAccepted;

      // remove this user from suggestions once a request is sent/accepted
      this.suggested.update((list) => list.filter((x) => x.user_id !== u.user_id));

      if (accepted) {
        await this.loadFriends();
        this.toastr.success(
          `You're now friends with ${u.display_name || u.name || u.email}.`,
          'Friend request accepted'
        );
      } else {
        await this.loadOutgoing();
        this.toastr.success(
          `Friend request sent to ${u.display_name || u.name || u.email}.`,
          'Request sent'
        );
      }
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
      this.toastr.error(this.errorMsg()!, 'Friend request');
    } finally {
      this.adding.set(false);
    }
  }

  async removeFriend(friendEmail: string) {
    if (!confirm(`Remove ${friendEmail} from your friends?`)) return;
    try {
      const res = await fetch(`${API}/friends`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail }),
      });
      if (!res.ok && res.status !== 204) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Could not remove friend');
      }

      // refresh current friends list
      await this.loadFriends();

      // also refresh suggestions so removed friends (still in outings)
      // can now appear in the Suggested Friends grid again
      await this.loadSuggestions(true);

      this.toastr.info(`Removed ${friendEmail} from your friends.`, 'Friend removed');
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    }
  }

  async accept(email: string) {
    try {
      const res = await fetch(`${API}/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail: email }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error || 'Failed to accept');
      await Promise.all([this.loadFriends(), this.loadPending()]);
      this.toastr.success(`You and ${email} are now friends.`, 'Request accepted');
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    }
  }

  async decline(email: string) {
    try {
      const res = await fetch(`${API}/friends/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail: email }),
      });
      if (!res.ok && res.status !== 204) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Failed to decline');
      }
      await this.loadPending();
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    } finally {
      await this.loadPending();
      this.toastr.info(`Declined request from ${email}.`, 'Request declined');
    }
  }

  async cancel(email: string) {
    try {
      const res = await fetch(`${API}/friends/request`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meEmail: this.meEmail, friendEmail: email }),
      });
      if (!res.ok && res.status !== 204) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Failed to cancel request');
      }

      await this.loadOutgoing();

      // refresh suggestions so this user can reappear there if they match
      await this.loadSuggestions(true);

      this.toastr.info(`Canceled request to ${email}.`, 'Request canceled');
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    }
  }

  // ---------- Navigation helpers ----------
  goChatWith(f: FriendRow) {
    this.router.navigate(['/chat'], { queryParams: { friendEmail: f.email } });
  }

  goChatThread(threadId: number) {
    this.router.navigate(['/chat'], { queryParams: { threadId } });
  }

  // avatars
  defaultAvatar = 'assets/default_pfp.jpg';
  avatarUrl(u: { avatar_path?: string | null }) {
    return u?.avatar_path || this.defaultAvatar;
  }
  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && img.src.indexOf(this.defaultAvatar) === -1) {
      img.src = this.defaultAvatar;
    }
  }

  // view user profile
  viewUser(u: { user_id: string }) {
    this.router.navigate(['/users', u.user_id]);
  }
}
