import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../header/header';

const API = 'http://localhost:3001/api';

type PubProfile = {
  user_id: string;
  email?: string | null;
  name?: string | null;
  display_name?: string | null; // from profiles.display_name
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null; // public URL (or null)
  preferences?: string[];
  updated_at?: string | null;
};

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
})
export class UserProfilePage implements OnInit {
  // data
  prof = signal<PubProfile | null>(null);

  // ui
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // assets
  defaultAvatar = 'assets/default_pfp.jpg';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    if (!id) {
      this.router.navigate(['/homepage']);
      return;
    }
    this.load(id);
  }

  // derived UI bits
  titleName = computed(() => {
    const p = this.prof();
    return p?.display_name || p?.name || p?.username || 'User';
  });

  email = computed(() => this.prof()?.email || '');

  initial = computed(() => {
    // fallback initial if the default image also fails
    const p = this.prof();
    const source = (p?.display_name || p?.name || p?.username || p?.email || 'U').trim();
    return (source[0] || 'U').toUpperCase();
  });

  avatarSrc(): string {
    const url = this.prof()?.avatar_url;
    return url || this.defaultAvatar;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && !img.src.includes(this.defaultAvatar)) {
      img.src = this.defaultAvatar;
    }
  }

  async load(userId: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${API}/profile/public/${encodeURIComponent(userId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load profile');
      // normalize
      this.prof.set({
        user_id: body.user_id,
        email: body.email ?? null,
        name: body.name ?? null,
        display_name: body.display_name ?? null,
        username: body.username ?? null,
        bio: body.bio ?? null,
        avatar_url: body.avatar_url ?? null,
        preferences: Array.isArray(body.preferences) ? body.preferences : [],
        updated_at: body.updated_at ?? null,
      });
    } catch (e: any) {
      this.error.set(e?.message || 'Network error');
    } finally {
      this.loading.set(false);
    }
  }
}
