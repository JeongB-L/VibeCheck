import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../header/header';
import { ToastrService } from 'ngx-toastr';

const API = 'http://localhost:3001';

export interface Comment {
  id?: number;
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
  timestamp: string; // ISO string from DB
  likes: number;
  liked_by_me: boolean;
  comments: Comment[];
  showComments: boolean;
  outing_title?: string; // Optional: if we want to show which outing it belongs to -> we prolly dont need it unless it is required cuz its not in ac.
}

@Component({
  selector: 'app-highlights',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, RouterModule],
  templateUrl: './highlights.html',
  styleUrls: ['./highlights.css'],
})
export class HighlightsComponent implements OnInit {
  private toast = inject(ToastrService);

  // State
  isCreating = signal(false);
  isLoading = signal(false);
  isSubmitting = signal(false);

  // Form inputs
  newCaption = '';
  newLocation = '';
  selectedFile: File | null = null;
  previewUrl: string | null = null;

  // Data
  posts = signal<Post[]>([]);

  get userEmail(): string | null {
    return sessionStorage.getItem('userEmail');
  }

  async ngOnInit() {
    await this.fetchPosts();
  }

  // --- API: Fetch Feed ---
  async fetchPosts() {
    if (!this.userEmail) return;
    this.isLoading.set(true);

    try {
      const res = await fetch(`${API}/api/highlights?email=${encodeURIComponent(this.userEmail)}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to load feed');

      // Initialize UI state (showComments = false) for each post
      const mappedPosts = (data.posts || []).map((p: Post) => ({
        ...p,
        showComments: false,
      }));

      this.posts.set(mappedPosts);
    } catch (err: any) {
      console.error(err);
      this.toast.error('Could not load highlights');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- API: Create Post ---
  async submitPost() {
    if (!this.selectedFile) {
      this.toast.warning('Please select a photo!');
      return;
    }
    if (!this.userEmail) {
      this.toast.error('You must be logged in.');
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formData = new FormData();
      formData.append('email', this.userEmail);
      formData.append('photo', this.selectedFile);
      formData.append('caption', this.newCaption);
      formData.append('location', this.newLocation);

      // we can also link post to an outing if we want -> needs more implementation

      const res = await fetch(`${API}/api/highlights`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      this.toast.success('Highlight shared!');
      this.toggleCreateMode(); // Close modal

      // Refresh feed to see new post (or unshift it manually if we returned the full object)
      await this.fetchPosts();
    } catch (err: any) {
      console.error(err);
      this.toast.error(err.message || 'Failed to create post');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- API: Like Post ---
  async toggleLike(post: Post) {
    if (!this.userEmail) return;

    // Immediate UI Update
    const wasLiked = post.liked_by_me;
    post.liked_by_me = !wasLiked;
    post.likes += wasLiked ? -1 : 1;

    try {
      const res = await fetch(`${API}/api/highlights/${post.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.userEmail }),
      });

      if (!res.ok) {
        // Revert on failure
        post.liked_by_me = wasLiked;
        post.likes += wasLiked ? 1 : -1;
        this.toast.error('Failed to like post');
      }
    } catch (err) {
      // Revert on error
      post.liked_by_me = wasLiked;
      post.likes += wasLiked ? 1 : -1;
    }
  }

  // --- API: Add Comment ---
  async addComment(post: Post, inputElement: HTMLInputElement) {
    const text = inputElement.value.trim();
    if (!text || !this.userEmail) return;

    try {
      const res = await fetch(`${API}/api/highlights/${post.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.userEmail,
          text: text,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to comment');

      // Add the returned comment to the list
      post.comments.push(data.comment);
      post.showComments = true;
      inputElement.value = ''; // Clear input
    } catch (err: any) {
      this.toast.error(err.message || 'Could not post comment');
    }
  }

  // --- UI Helpers ---

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
      if (!file.type.startsWith('image/')) {
        this.toast.warning('Please select an image file');
        return;
      }
      this.selectedFile = file;

      const reader = new FileReader();
      reader.onload = (e: any) => (this.previewUrl = e.target.result);
      reader.readAsDataURL(file);
    }
  }

  toggleComments(post: Post) {
    post.showComments = !post.showComments;
  }

  // Helper to make timestamps look nice (e.g. "2h ago")
  timeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + 'y ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + 'mo ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + 'd ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + 'h ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + 'm ago';
    return 'Just now';
  }
}
