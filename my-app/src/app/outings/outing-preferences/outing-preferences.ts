import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  inject,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HeaderComponent } from '../../header/header';
import { ToastrService } from 'ngx-toastr';

const API = 'http://localhost:3001';

@Component({
  standalone: true,
  selector: 'app-outing-detail',
  imports: [CommonModule, RouterModule, HeaderComponent],
  templateUrl: './outing-preferences.html',
  styleUrls: ['./outing-preferences.css'],
})
export class OutingPreferences {}
