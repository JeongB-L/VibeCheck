import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterModule],
  standalone: true,
  templateUrl: './signup.html',
  styleUrl: './signup.css'
})
export class Signup {
  
  email: string = '';
  password: string = '';

  onSignup() {
    alert(`Signing up with\nEmail: ${this.email}\nPassword: ${this.password}`);
  }

}
