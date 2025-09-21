import { Routes } from '@angular/router';
import { Landing } from './landing/landing'
import { Signup } from './signup/signup' 
import { Login } from './login/login' 

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
    }





];
