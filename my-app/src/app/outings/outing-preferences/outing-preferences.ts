import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipSelectionChange, MatChipsModule } from '@angular/material/chips';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';
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
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private norm(s: unknown) {
    return String(s ?? '')
      .trim()
      .toLowerCase();
  }
  private uniq(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of list ?? []) {
      const t = String(v).trim();
      if (!t) continue;
      const k = this.norm(t);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  }

  // For [selected] bindings
  isSelected(list: string[], value: string): boolean {
    const k = this.norm(value);
    return (list ?? []).some((v) => this.norm(v) === k);
  }

  // ---- base data ----
  private readonly BASE_ACTIVITIES = [
    'Amusement Parks',
    'Art Classes',
    'Art Galleries',
    'Billiards',
    'Biking',
    'Bird Watching',
    'Boat Tours',
    'Bowling',
    'Brewery Tours',
    'Camping',
    'Canoeing',
    'Casino',
    'Concerts',
    'Cooking Classes',
    'Cycling',
    'Dancing',
    'Escape Rooms',
    'Farmers Market',
    'Fishing',
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
    'Museums',
    'Must-see Attractions',
    'Night Life',
    'Paintball',
    'Parks & Gardens',
    'Photography Walk',
    'Picnicking',
    'Pottery Classes',
    'Roller Skating',
    'Sailing',
    'Shopping',
    'Skateboarding',
    'Skiing/Snowboarding',
    'Spa & Wellness',
    'Stargazing',
    'Surfing',
    'Swimming',
    'Virtual Reality Arcade',
    'Wine Tasting',
    'Yoga',
  ].sort((a, b) => a.localeCompare(b));

  private readonly BASE_CUISINES = [
    'African',
    'American',
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

  private readonly BASE_BUDGET = ['Inexpensive', 'Moderate', 'Expensive', 'Very Expensive'];

  pageOptions = [[...this.BASE_ACTIVITIES], [...this.BASE_CUISINES], [...this.BASE_BUDGET]];

  selectedActivities: string[] = [];
  selectedFood: string[] = [];
  selectedBudget: string[] = [];

  newActivityInput = '';
  newFoodInput = '';
  isLoaded = false;

  // ---- toggles ----
  toggleActivities(ev: MatChipSelectionChange, val: string) {
    this.updateSelection(
      ev,
      val,
      this.selectedActivities,
      (list) => (this.selectedActivities = list)
    );
  }

  toggleFood(ev: MatChipSelectionChange, val: string) {
    this.updateSelection(ev, val, this.selectedFood, (list) => (this.selectedFood = list));
  }

  toggleBudget(ev: MatChipSelectionChange, val: string) {
    this.updateSelection(ev, val, this.selectedBudget, (list) => (this.selectedBudget = list));
  }

  private updateSelection(
    ev: MatChipSelectionChange,
    val: string,
    current: string[],
    setter: (v: string[]) => void
  ) {
    const k = this.norm(val);
    if (ev.selected) {
      if (!current.some((v) => this.norm(v) === k)) setter([...current, val.trim()]);
    } else {
      setter(current.filter((v) => this.norm(v) !== k));
    }
  }

  // ---- custom adds ----
  addCustomActivity() {
    const opt = this.newActivityInput.trim();
    if (!opt) return;
    if (!this.pageOptions[0].some((v) => this.norm(v) === this.norm(opt)))
      this.pageOptions[0].push(opt);
    if (!this.selectedActivities.some((v) => this.norm(v) === this.norm(opt)))
      this.selectedActivities.push(opt);
    this.newActivityInput = '';
    this.pageOptions[0].sort((a, b) => a.localeCompare(b));
  }

  addCustomFood() {
    const opt = this.newFoodInput.trim();
    if (!opt) return;
    if (!this.pageOptions[1].some((v) => this.norm(v) === this.norm(opt)))
      this.pageOptions[1].push(opt);
    if (!this.selectedFood.some((v) => this.norm(v) === this.norm(opt)))
      this.selectedFood.push(opt);
    this.newFoodInput = '';
    this.pageOptions[1].sort((a, b) => a.localeCompare(b));
  }

  // ---- lifecycle ----
  ngOnInit() {
    const outingId = this.route.snapshot.paramMap.get('id')!;
    const email = sessionStorage.getItem('userEmail') || '';
    if (outingId && email) this.loadExisting(outingId, email);
    else this.isLoaded = true;
  }

  private ensureOptions(pageIndex: number, values: string[]) {
    for (const v of values) {
      const key = this.norm(v);
      const exists = this.pageOptions[pageIndex].some((x) => this.norm(x) === key);
      if (!exists) {
        this.pageOptions[pageIndex].push(v.trim());
      }
    }

    // keep Activities/Food sorted; Budget stays ordered
    if (pageIndex !== 2) {
      this.pageOptions[pageIndex].sort((a, b) => a.localeCompare(b));
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

      // de-dupe + trim incoming
      this.selectedActivities = this.uniq(Array.isArray(b.activities) ? b.activities : []);
      this.selectedFood = this.uniq(Array.isArray(b.food) ? b.food : []);
      this.selectedBudget = this.uniq(Array.isArray(b.budget) ? b.budget : []);

      // make sure all saved selections show up as chips
      this.ensureOptions(0, this.selectedActivities);
      this.ensureOptions(1, this.selectedFood);
      this.ensureOptions(2, this.selectedBudget);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Could not load saved preferences');
    } finally {
      this.isLoaded = true;
    }
  }

  async submitInterests() {
    const outingId = this.route.snapshot.paramMap.get('id');
    const email = sessionStorage.getItem('userEmail');
    if (!email) {
      this.toastr.error('You must be logged in.');
      this.router.navigate(['/login']);
      return;
    }
    const payload = {
      email,
      activities: this.uniq(this.selectedActivities),
      food: this.uniq(this.selectedFood),
      budget: this.uniq(this.selectedBudget),
    };
    try {
      const res = await fetch(`${API}/api/outings/${outingId}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to save');
      this.toastr.success('Preferences saved!');
      this.router.navigate([`/outings/${outingId}`]);
    } catch (e: any) {
      this.toastr.error(e?.message || 'Save failed');
    }
  }
}
