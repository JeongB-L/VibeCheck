import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header';
import { FormsModule } from '@angular/forms';

// --- Interfaces to define what a Post looks like ---
export interface Comment {
  user: string;
  text: string;
}

export interface Post {
  id: number;
  user_name: string;
  user_avatar: string | null;
  location?: string;
  image_url: string;
  caption: string;
  timestamp: string;
  likes: number;
  liked_by_me: boolean;
  comments: Comment[];
  showComments: boolean; // UI state: are comments expanded?
}

@Component({
  selector: 'app-highlights',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, RouterModule],
  templateUrl: './highlights.html',
  styleUrls: ['./highlights.css'],
})
export class HighlightsComponent {
  // --- State ---
  isCreating = signal(false); // Controls the visibility of the "Create Post" form

  // Temporary form inputs
  newCaption = '';
  newLocation = '';
  selectedFile: File | null = null;
  previewUrl: string | null = null;

  // --- Mock Data (So you see something on screen immediately) ---
  posts = signal<Post[]>([
    {
      id: 1,
      user_name: 'Jeongbin Lee',
      user_avatar: null, // null will show a default placeholder
      location: 'Millennium Park',
      image_url:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Cloud_Gate_in_Millennium_Park%2C_Chicago.jpg/1200px-Cloud_Gate_in_Millennium_Park%2C_Chicago.jpg',
      caption: 'The Bean was super crowded but worth it! 🏙️',
      timestamp: '2 hours ago',
      likes: 24,
      liked_by_me: true,
      comments: [
        { user: 'Sarah', text: 'Great shot!' },
        { user: 'Mike', text: 'Did you get pizza after?' },
      ],
      showComments: false,
    },
    {
      id: 2,
      user_name: 'Alex Smith',
      user_avatar: null,
      location: "Giordano's Pizza",
      image_url: 'https://www.giordanos.com/wp-content/uploads/2023/04/Hero-Image-1358x624-1.jpg',
      caption: 'Best deep dish in town. I am so full. 🍕',
      timestamp: '5 hours ago',
      likes: 8,
      liked_by_me: false,
      comments: [],
      showComments: false,
    },
  ]);

  // --- Actions ---

  toggleCreateMode() {
    this.isCreating.set(!this.isCreating());
    // Reset form
    this.newCaption = '';
    this.newLocation = '';
    this.selectedFile = null;
    this.previewUrl = null;
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      // Create a fake local URL just for previewing
      const reader = new FileReader();
      reader.onload = (e: any) => (this.previewUrl = e.target.result);
      reader.readAsDataURL(file);
    }
  }

  // Placeholder for the real backend logic
  submitPost() {
    if (!this.selectedFile) {
      alert('Please select a photo!');
      return;
    }
    alert(`Post created! (This is where we send data to Supabase)\nCaption: ${this.newCaption}`);
    this.toggleCreateMode();
  }

  toggleLike(post: Post) {
    // Optimistic UI update
    post.liked_by_me = !post.liked_by_me;
    post.likes += post.liked_by_me ? 1 : -1;
  }

  toggleComments(post: Post) {
    post.showComments = !post.showComments;
  }

  addComment(post: Post, inputElement: HTMLInputElement) {
    const text = inputElement.value.trim();
    if (!text) return;

    post.comments.push({
      user: 'Me', // We will replace this with the real logged-in user later
      text: text,
    });

    // Auto-open comments to show the new one
    post.showComments = true;
    inputElement.value = '';
  }
}
