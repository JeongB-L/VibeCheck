import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent],
  templateUrl: './homepage.html',
  styleUrls: ['./homepage.css'],
})
export class Homepage {
  userEmail = sessionStorage.getItem('userEmail') || '';
  userId = sessionStorage.getItem('userId') || '';
  menuOpen = signal(false);

  constructor(private router: Router) {}

  toggleMenu() {
    this.menuOpen.update((v) => !v);
  }
  closeMenu() {
    this.menuOpen.set(false);
  }

  goProfile() {
    this.closeMenu();
    this.router.navigate(['/settings/profile']);
  }
  goSettings() {
    this.closeMenu();
    this.router.navigate(['/settings']);
  }
  goMyOutings() {
    this.router.navigate(['/outings']);
  }
  goContact() {
    this.router.navigate(['/contact']);
  }

  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userId');
    this.closeMenu();
    this.router.navigate(['/login']);
  }
}
