import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit {
  protected readonly title = signal('my-apps');

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    console.log('✅ App component loaded');
    console.log('Title is:', this.title());

    // 👉 Test DB connection
    this.http.get<{ connected: boolean; time: string }>('http://localhost:3000/api/db-check')
      .subscribe({
        next: (res) => {
          console.log('🗄️ DB check:', res);
        },
        error: (err) => {
          console.error('❌ Error calling DB check:', err);
        }
      });

    // 👉 (Optional) Fetch rows from test users table
    this.http.get<any[]>('http://localhost:3000/api/users')
      .subscribe({
        next: (users) => {
          console.log('👥 Users from DB:', users);
        },
        error: (err) => {
          console.error('❌ Error fetching users:', err);
        }
      });
  }
}
