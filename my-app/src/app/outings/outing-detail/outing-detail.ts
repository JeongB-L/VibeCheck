
import { CommonModule } from '@angular/common';
import { Component, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { HeaderComponent } from '../../header/header';
import { Router } from '@angular/router';

@Component({
  selector: 'app-outing-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './outing-detail.html',
  styleUrl: './outing-detail.css'
})

export class OutingDetail {

}
