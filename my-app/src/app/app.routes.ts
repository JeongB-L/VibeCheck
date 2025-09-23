import { Routes } from '@angular/router';
import { Landing } from './landing/landing';
import { Signup } from './signup/signup';
import { Login } from './login/login';
import { Homepage } from './homepage/homepage';
import { VerifyEmailComponent } from './verify_email_page/verify-email';

export const routes: Routes = [
  {
    path: '',
    component: Landing,
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'signup',
    component: Signup,
  },
  {
    path: 'homepage',
    component: Homepage,
  },
  { path: 'verify', component: VerifyEmailComponent },
];
