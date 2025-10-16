import { Routes } from '@angular/router';
import { Landing } from './landing/landing';
import { Signup } from './signup/signup';
import { Login } from './login/login';
import { Homepage } from './homepage/homepage';
import { VerifyEmailComponent } from './verify_email_page/verify-email';
import { ResetPassword } from './reset_password/reset_password';
import { authGuard } from './auth.guard';
import { Outings } from './outings/outings';
import { ContactComponent } from './contact/contact';
import { SettingsPage } from './settings/settings';
import { OutingDetail } from './outings/outing-detail/outing-detail';
import { ProfileHistory } from './settings/profile-history/profile-history';
import { ChangePassword } from './settings/change-password/change-password';
import { FriendsPage } from './friends/friends';

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
    canActivate: [authGuard],
  },
  { path: 'verify', component: VerifyEmailComponent },
  {
    path: 'reset_password',
    component: ResetPassword,
  },
  {
    path: 'settings/profile',
    loadComponent: () =>
      import('./settings/profile-settings/profile-settings').then((m) => m.ProfileSettings),
  },
  { path: 'outings', component: Outings },
  {
    path: 'outings/:id',
    component: OutingDetail,
  },
  { path: 'contact', component: ContactComponent },
  { path: 'settings', component: SettingsPage },
  { path: 'settings/profile-history', component: ProfileHistory },
  { path: 'settings/change-password', component: ChangePassword },
  { path: 'friends', component: FriendsPage },
];
