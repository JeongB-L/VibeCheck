import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipSelectionChange } from '@angular/material/chips';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

const API = 'http://localhost:3001';

@Component({
  standalone: true,
  selector: 'app-outing-detail',
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './outing-preferences.html',
  styleUrls: ['./outing-preferences.css'],
})
export class OutingPreferences {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // 0: Page 1, 1: Page 2, 2: Page 3
  currentPage = signal(0);
  maxPages = 3;

  // Temporary options for each page; will need to replace this with dynamically fetched tags.
  pageOptions = [
    // Page 1: Activity Preferences
    [
      'Sleeping Under the Stars',
      'Hidden Gems',
      'Art Deco Historic District',
      'Beach Clubs',
      'Bike Riding',
      'Snorkeling Adventures',
      'Everglades Airboat Tours',
      'Kayaking in Biscayne Bay',
      'Vizcaya Museum & Gardens',
      'Sunset Dolphin Cruises',
      'Stargazing',
      'Cultural Festivals',
      'Live Music Venues',
      'Food Truck Tours',
      'Historic Landmarks',
      'Yoga on the Beach',
      'Photography Spots',
      'Wildlife Watching',
      'Boat Rentals',
      'Cigar Lounges',
    ],
    // Page 2: Food Preferences
    [
      'Cuban Cuisine',
      'Chinese',
      'Italian',
      'Seafood',
      'Vegan & Vegetarian',
      'Farm-to-Table',
      'Mexican',
      'Steakhouse',
      'Japanese Sushi & Ramen',
      'Indian Spices & Curries',
      'Thai Street Food',
      'Mediterranean Mezze',
      'Korean BBQ',
      'French Bistro Fare',
      'Latin American Fusion',
      'Southern Comfort Food',
    ],
    // Page 3: Budget Preferences
    ['$', '$$', '$$$', '$$$$'],
  ];

  selectedActivities: string[] = []; // Page 0 selections
  selectedFood: string[] = []; // Page 1 selections
  selectedBudget: string[] = []; // Page 2 selections

  get currentOptions(): string[] {
    return this.pageOptions[this.currentPage()] || [];
  }

  get currentSelections(): string[] {
    switch (this.currentPage()) {
      case 0:
        return this.selectedActivities;
      case 1:
        return this.selectedFood;
      case 2:
        return this.selectedBudget;
      default:
        return [];
    }
  }

  toggleSelection(event: MatChipSelectionChange, interest: string): void {
    const selections = this.currentSelections;
    if (event.selected) {
      selections.push(interest);
    } else {
      const index = selections.indexOf(interest);
      if (index >= 0) {
        selections.splice(index, 1);
      }
    }
  }

  prevPage(): void {
    this.currentPage.update((page) => Math.max(0, page - 1));
  }

  nextPage(): void {
    this.currentPage.update((page) => Math.min(this.maxPages - 1, page + 1));
  }

  async submitInterests() {
    const userId = sessionStorage.getItem('userId');
    const outingId = this.route.snapshot.paramMap.get('id');

    if (!userId) {
      this.toastr.error('You must be logged in to save preferences.');
      this.router.navigate(['/login']);
      return;
    }

    // Backend call to store selections in DB
    try {
      const res = await fetch(`${API}/api/outings/${outingId}/updateUserOutingPreferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          outingId: outingId,
          activities: this.selectedActivities,
          food: this.selectedFood,
          budget: this.selectedBudget,
        }),
      });

      // Get back upon success
      console.log(res);
      if (res.ok) {
        this.toastr.success('Preferences saved!');
        this.router.navigate([`/outings/${outingId}`]);
      } else {
        console.error('Error saving preferences');
        this.toastr.error('Failed to save preferences. Please try again.');
      }
    } catch (e: any) {
      console.error('Error saving preferences:', e);
      this.toastr.error('Failed to save preferences. Please try again.');
    }
  }

  isFirstPage(): boolean {
    return this.currentPage() === 0;
  }

  isLastPage(): boolean {
    return this.currentPage() === this.maxPages - 1;
  }
}
