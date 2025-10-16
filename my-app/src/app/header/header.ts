import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { InactivityService } from '../inactivity/inactivity.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  @Input() logoSrc = 'assets/vibechecklogo.png';
  @Input() showOutings = true; // keep Outings visible outside menu
  @Input() showContact = false; // optional extra action

  menuOpen = signal(false);

  constructor(private router: Router, private inactivity: InactivityService) {
    const email = sessionStorage.getItem('userEmail') || '';
    this.inactivity.initFromServer(email);
  }

  toggleMenu() {
    this.menuOpen.update((v) => !v);
  }
  closeMenu() {
    this.menuOpen.set(false);
  }

  goMyOutings() {
    this.router.navigate(['/outings']);
  }
  goContact() {
    this.router.navigate(['/contact']);
  }
  goProfile() {
    this.closeMenu();
    this.router.navigate(['/settings/profile']);
  }
  goSettings() {
    this.closeMenu();
    this.router.navigate(['/settings']);
  }

  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userId');
    this.closeMenu();
    this.router.navigate(['/login']);
  }

  goFriends() {
    this.closeMenu();
    this.router.navigate(['/friends']);
  }
}
