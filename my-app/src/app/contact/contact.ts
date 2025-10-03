import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

type CompanyLink = { label: string; href: string };

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact.html',
  styleUrls: ['./contact.css']
})
export class ContactComponent {
  constructor(private router: Router) {}

  company = {
    name: 'VibeCheck',
    email: 'support@vibecheck.app',
    phone: '+1 (555) 123-4567',
    addressLine1: '123 Vibes Ave',
    addressLine2: 'Suite 42',
    city: 'West Lafayette',
    state: 'IN',
    zip: '47906',
    hours: [
      { label: 'Mon–Fri', value: '9:00 AM – 6:00 PM ET' },
      { label: 'Sat',     value: '10:00 AM – 2:00 PM ET' },
      { label: 'Sun',     value: 'Closed' },
    ],
    socials: [
      { label: 'Twitter/X', href: 'https://x.com' },
      { label: 'Instagram', href: 'https://instagram.com' },
      { label: 'LinkedIn',  href: 'https://linkedin.com' },
    ] as CompanyLink[],
  };

  get fullAddress(): string {
    const c = this.company;
    const line2 = c.addressLine2 ? `, ${c.addressLine2}` : '';
    return `${c.addressLine1}${line2}, ${c.city}, ${c.state} ${c.zip}`;
  }

  goHome(): void {
    this.router.navigate(['/homepage']);
  }
}
