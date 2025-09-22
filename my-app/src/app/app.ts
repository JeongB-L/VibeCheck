import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from './environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  protected readonly title = signal('my-apps');

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    console.log('✅ App component loaded');
    console.log('Title is:', this.title());

    // 👉 Test DB connection using environment config
    const apiBaseUrl = `${environment.apiUrl}/api/test-db`;

    this.http.get<{ connected: boolean; time: string }>(apiBaseUrl).subscribe({
      next: (res) => {
        console.log('🗄️ DB check:', res);
      },
      error: (err) => {
        console.error('❌ Error calling DB check:', err);
      },
    });
  }
}
