import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-homepage',
  imports: [],
  templateUrl: './homepage.html',
  styleUrl: './homepage.css',
})
export class Homepage {
  userEmail = sessionStorage.getItem('userEmail') || '';

  constructor(private router: Router) {}

  goProfile() {
    this.router.navigate(['/settings/profile']); // adjust route if different
  }

  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    this.router.navigate(['/login']);
  }
}
