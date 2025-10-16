import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HeaderComponent } from '../header/header';
import { ToastrService } from 'ngx-toastr';

type Tab = 'current' | 'search' | 'pending';

interface FriendRow {
  user_id: string;
  email: string;
  name?: string;
  display_name?: string | null;
  avatar_path?: string | null;
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
      await this.loadFriends();
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
      this.toastr.info(`Canceled request to ${email}.`, 'Request canceled');
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Network error');
    }
  }

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
