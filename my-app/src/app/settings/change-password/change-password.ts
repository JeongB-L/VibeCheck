import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../../header/header';

const API = 'http://localhost:3001';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePassword implements OnInit {
  email = signal<string>(sessionStorage.getItem('userEmail') || '');
  firstName = signal<string>('');
  lastName = signal<string>('');
  profileHistory = signal<any[]>([]);
  loadingProfileHistory = signal<boolean>(false);

  constructor(private router: Router, private toastr: ToastrService) {}

  backHome() {
    this.router.navigate(['/homepage']);
  }

  ngOnInit(): void {
    if (!this.email()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadMe();
  }

  async loadMe() {
    const res = await fetch(`${API}/api/profile/me?email=${encodeURIComponent(this.email())}`);
    const body = await res.json();

    if (res.ok) {
      this.firstName.set(body?.first_name ?? '');
      this.lastName.set(body?.last_name ?? '');
    }
  }
}
