import { Routes } from '@angular/router';
import { Landing } from './landing/landing'
import { Signup } from './signup/signup' 
import { Login } from './login/login' 
import { Homeapge } from './homeapge/homeapge';

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
        path:'signup',
        component: Signup,
    },
    {
        path: 'homeapge',     
        component: Homeapge,
    }





];
