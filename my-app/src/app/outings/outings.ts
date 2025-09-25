import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

type OutingCard = {
  title: string;
  dateText: string;     // e.g., "Sep 18 → Sep 26, 2025"
  locationText: string; // e.g., "Greece, West Lafayette"
  image: string;
  current?: boolean;
  members?: string[];   // avatar URLs
};

@Component({
  selector: 'app-outings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './outings.html',
  styleUrl: './outings.css'
})

export class Outings {
  // Static mock data for UI only
  outings: OutingCard[] = [
    {
      title: 'summer',
      dateText: 'Sep 18 → Sep 26, 2025',
      locationText: 'Greece, West Lafayette, & 1 more',
      image: 'https://picsum.photos/seed/sea/900/400',
      current: true,
      members: [
        'https://i.pravatar.cc/40?img=3',
        'https://i.pravatar.cc/40?img=5',
        'https://i.pravatar.cc/40?img=7',
        'https://i.pravatar.cc/40?img=9',
      ],
    },
    {
      title: 'k',
      dateText: '— Add dates',
      locationText: 'Las Vegas',
      image: 'https://picsum.photos/seed/vegas/900/400',
      members: [
        'https://i.pravatar.cc/40?img=12',
        'https://i.pravatar.cc/40?img=14',
      ],
    },
  ];

  sortBy: 'start' | 'created' = 'start';
}
