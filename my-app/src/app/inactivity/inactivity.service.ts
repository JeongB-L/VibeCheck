import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

const API = 'http://localhost:3001/api';

@Injectable({ providedIn: 'root' })
export class InactivityService {
  private timerId: any = null;
  private minutes = 5; // default until fetched from DB
  private chan?: BroadcastChannel;

  constructor(private router: Router) {
    // cross-tab sync without localStorage
    if ('BroadcastChannel' in window) {
      this.chan = new BroadcastChannel('inactivity');
      this.chan.addEventListener('message', (e: MessageEvent) => {
        const msg = e.data || {};
        if (msg.type === 'activity') this.startTimer();
        if (msg.type === 'set-minutes') {
          const m = Number(msg.value);
          if (Number.isFinite(m) && m > 0) {
            this.minutes = Math.floor(m);
            this.startTimer();
          }
        }
        if (msg.type === 'logout') this.forceLogout();
      });
    }

    // user activity listeners
    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'visibilitychange',
    ];
    events.forEach((ev) => document.addEventListener(ev, () => this.resetTimer(), true));

    this.startTimer(); // will be reconfigured once DB value arrives via initFromServer / settings
  }

  /** Fetch timeout from DB and apply (call this once on app/header startup) */
  async initFromServer(email: string) {
    if (!email) return;
    try {
      const res = await fetch(`${API}/profile/me?email=${encodeURIComponent(email)}`);
      const body = await res.json();
      if (res.ok) {
        const m = Number(body?.profile?.idle_timeout_minutes ?? 5);
        if (Number.isFinite(m) && m > 0) {
          this.minutes = Math.floor(m);
          this.startTimer();
        }
      }
    } catch {
      /* ignore */
    }
  }

  getTimeoutMinutes(): number {
    return this.minutes;
  }

  /** Called after saving a new value to the DB */
  setTimeoutMinutes(mins: number) {
    if (!Number.isFinite(mins) || mins <= 0) return;
    this.minutes = Math.floor(mins);
    this.startTimer();
    this.chan?.postMessage({ type: 'set-minutes', value: this.minutes });
  }

  /** Mark user as active and reset countdown */
  resetTimer() {
    this.startTimer();
    this.chan?.postMessage({ type: 'activity' });
  }

  private startTimer() {
    if (this.timerId) clearTimeout(this.timerId);
    const ms = this.minutes * 60_000;
    this.timerId = setTimeout(() => this.handleInactivity(), ms);
  }

  private handleInactivity() {
    const loggedIn = !!sessionStorage.getItem('authToken') || !!sessionStorage.getItem('userId');
    if (!loggedIn) return;
    this.forceLogout();
    this.chan?.postMessage({ type: 'logout' });
  }

  private forceLogout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userId');
    this.router.navigate(['/login']);
  }
}
