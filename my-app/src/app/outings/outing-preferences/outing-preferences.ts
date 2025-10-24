import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipSelectionChange } from '@angular/material/chips';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

const API = 'http://localhost:3001';

@Component({
  standalone: true,
  selector: 'app-outing-detail',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HeaderComponent,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
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

  private readonly BASE_ACTIVITIES = [
    'Amusement Parks',
    'Archery',
    'Art Classes',
    'Art Galleries',
    'ATV Riding',
    'Billiards',
    'Biking',
    'Bird Watching',
    'Board Games',
    'Boat Tours',
    'Bowling',
    'Boxing Classes',
    'Brewery Tours',
    'Camping',
    'Canoeing',
    'Casino',
    'Climbing Gym',
    'Concerts',
    'Cooking Classes',
    'Cycling',
    'Dancing',
    'Escape Rooms',
    'Farmers Market',
    'Fishing',
    'Fitness Classes',
    'Food Tours',
    'Go-Karting',
    'Golfing',
    'Hiking',
    'Horseback Riding',
    'Ice Skating',
    'Jet Skiing',
    'Karaoke',
    'Kayaking',
    'Laser Tag',
    'Live Theater',
    'Mini Golf',
    'Movie Night',
    'Museums',
    'Paint & Sip',
    'Paintball',
    'Parks & Gardens',
    'Photography Walk',
    'Picnicking',
    'Pottery Classes',
    'Roller Skating',
    'Sailing',
    'Skateboarding',
    'Skiing/Snowboarding',
    'Spa & Wellness',
    'Stargazing',
    'Surfing',
    'Swimming',
    'Tennis',
    'Thrifting',
    'Trivia Night',
    'Virtual Reality Arcade',
    'Volunteering',
    'Wine Tasting',
    'Yoga',
  ].sort((a, b) => a.localeCompare(b));

  private readonly BASE_CUISINES = [
    'African',
    'American (New)',
    'American (Traditional)',
    'Argentinian',
    'Asian Fusion',
    'Australian',
    'BBQ',
    'Bakery',
    'Bangladeshi',
    'Brazilian',
    'Breakfast & Brunch',
    'British',
    'Bubble Tea',
    'Burgers',
    'Cajun/Creole',
    'Cambodian',
    'Caribbean',
    'Chinese',
    'Cuban',
    'Desserts',
    'Dim Sum',
    'Diner',
    'Ethiopian',
    'Filipino',
    'French',
    'Gastropub',
    'Georgian',
    'German',
    'Greek',
    'Halal',
    'Hawaiian',
    'Healthy',
    'Indian',
    'Indonesian',
    'Irish',
    'Italian',
    'Jamaican',
    'Japanese',
    'Korean',
    'Kosher',
    'Laotian',
    'Latin American',
    'Lebanese',
    'Malaysian',
    'Mediterranean',
    'Mexican',
    'Middle Eastern',
    'Moroccan',
    'Nepalese',
    'Noodles',
    'Pakistani',
    'Peruvian',
    'Pizza',
    'Polish',
    'Portuguese',
    'Ramen',
    'Salad',
    'Sandwiches',
    'Seafood',
    'Shanghainese',
    'Singaporean',
    'Soul Food',
    'Soup',
    'Spanish',
    'Sri Lankan',
    'Steakhouses',
    'Sushi Bars',
    'Taiwanese',
    'Tapas/Small Plates',
    'Tex-Mex',
    'Thai',
    'Turkish',
    'Ukrainian',
    'Vegan',
    'Vegetarian',
    'Vietnamese',
    'Wings',
  ].sort((a, b) => a.localeCompare(b));

  private readonly BASE_BUDGET = ['$', '$$', '$$$', '$$$$'];

  pageOptions = [[...this.BASE_ACTIVITIES], [...this.BASE_CUISINES], [...this.BASE_BUDGET]];

  selectedActivities: string[] = []; // Page 0 selections
  selectedFood: string[] = []; // Page 1 selections
  selectedBudget: string[] = []; // Page 2 selections

  newOptionInput = ''; // Input for custom option

  get currentOptions(): string[] {
    const arr = this.pageOptions[this.currentPage()] || [];
    return [...arr].sort((a, b) => a.localeCompare(b));
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

  get currentType(): string {
    switch (this.currentPage()) {
      case 0:
        return 'activity';
      case 1:
        return 'cuisine';
      case 2:
        return 'budget level';
      default:
        return '';
    }
  }

  toggleSelection(event: MatChipSelectionChange, interest: string): void {
    const selections = this.currentSelections;
    if (event.selected) {
      if (!selections.includes(interest)) {
        selections.push(interest);
      }
    } else {
      const index = selections.indexOf(interest);
      if (index >= 0) {
        selections.splice(index, 1);
      }
    }
  }

  addCustomOption(): void {
    const option = this.newOptionInput.trim();
    if (option && !this.currentOptions.includes(option)) {
      this.pageOptions[this.currentPage()].push(option);
      this.currentSelections.push(option);
    }
    this.newOptionInput = '';
  }

  prevPage(): void {
    this.currentPage.update((page) => Math.max(0, page - 1));
  }

  nextPage(): void {
    this.currentPage.update((page) => Math.min(this.maxPages - 1, page + 1));
  }

  async submitInterests() {
    const outingId = this.route.snapshot.paramMap.get('id');
    const email = sessionStorage.getItem('userEmail');

    if (!email) {
      this.toastr.error('You must be logged in to save preferences.');
      this.router.navigate(['/login']);
      return;
    }

    try {
      const res = await fetch(`${API}/api/outings/${outingId}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          activities: this.selectedActivities,
          food: this.selectedFood,
          budget: this.selectedBudget,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to save preferences');

      this.toastr.success('Preferences saved!');
      this.router.navigate([`/outings/${outingId}`]);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Failed to save preferences. Please try again.');
    }
  }

  isFirstPage(): boolean {
    return this.currentPage() === 0;
  }

  isLastPage(): boolean {
    return this.currentPage() === this.maxPages - 1;
  }

  ngOnInit() {
    const outingId = this.route.snapshot.paramMap.get('id')!;
    const email = sessionStorage.getItem('userEmail') || '';
    if (outingId && email) {
      this.loadExisting(outingId, email);
    }
  }

  private async loadExisting(outingId: string, email: string) {
    try {
      const r = await fetch(
        `${API}/api/outings/${encodeURIComponent(outingId)}/preferences?email=${encodeURIComponent(
          email
        )}`
      );
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || 'Failed to load preferences');

      this.selectedActivities = Array.isArray(b.activities) ? b.activities.slice() : [];
      this.selectedFood = Array.isArray(b.food) ? b.food.slice() : [];
      this.selectedBudget = Array.isArray(b.budget) ? b.budget.slice() : [];

      // make sure any saved custom choices show up as chips
      this.ensureOptions(0, this.selectedActivities);
      this.ensureOptions(1, this.selectedFood);
      this.ensureOptions(2, this.selectedBudget);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Could not load saved preferences');
    }
  }

  private ensureOptions(pageIndex: number, values: string[]) {
    const base = this.pageOptions[pageIndex];
    const seen = new Set(base.map((v) => v.toLowerCase()));
    for (const v of values) {
      const key = String(v).toLowerCase();
      if (!seen.has(key)) {
        base.push(v);
        seen.add(key);
      }
    }
  }
}
