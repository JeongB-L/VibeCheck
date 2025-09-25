import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-homepage',
  imports: [],
  templateUrl: './homepage.html',
  styleUrl: './homepage.css',
})
export class Homepage {
  constructor(private router: Router) {}

  logout() {

    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    this.router.navigate(['/login']);
  }
}