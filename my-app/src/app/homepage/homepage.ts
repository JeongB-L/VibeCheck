import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-homepage',
  imports: [],
  standalone: true, 
  templateUrl: './homepage.html',
  styleUrl: './homepage.css',
})
export class Homepage {
  userEmail = sessionStorage.getItem('userEmail') || '';
  userId = sessionStorage.getItem('userId') || '';

  constructor(private router: Router) {}

  goProfile() {
    this.router.navigate(['/settings/profile']); // adjust route if different
  }

  goMyOutings() {
    this.router.navigate(['/outings']);
  }

  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userId');
    this.router.navigate(['/login']);
  }
}
