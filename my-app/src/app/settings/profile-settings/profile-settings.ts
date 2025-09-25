import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.css',
})
export class ProfileSettings implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');

  constructor(private router: Router) {}

  initial = computed(() => {
    const e = this.email().trim();
    const name = e.split('@')[0] || 'U';
    return (name[0] || 'U').toUpperCase();
  });

  ngOnInit(): void {
    if (!this.email()) this.router.navigate(['/login']);
  }

  backHome() {
    this.router.navigate(['/homepage']);
  }
}
