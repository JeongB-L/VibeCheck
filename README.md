
# VibeCheck

## Problem Statement

Groups like friends and families often struggle to plan outings because everyone has different food preferences, budgets, and activity interests. This leads to back-and-forth discussions or plans that don’t satisfy everyone. Unlike existing restaurant finders or event planners, our system not only recommends dining and hangout options but also negotiates preferences across all group members to generate fair, optimized outing plans that balance cost, distance, and satisfaction. 

The project creates a shared space where group members enter their available time, food, budget, and activity preferences, then the system computes the best few combined schedules with trade-offs clearly explained. By incorporating group voting, fairness scoring, and smart distance/time optimization, it ensures that every member’s preferences are considered. This approach reduces friction, speeds up decision-making, and turns planning into a transparent and enjoyable process.

## Background Information

People rely on apps like Google Maps and TripAdvisor to find restaurants and activities. However, these platforms are individual-focused and lack collaborative decision-making features. There are no well-known applications that people use to plan hangouts together. Usually, people sit down to make itineraries or just talk about what they want to do for a certain day; however, this all takes time. 

Our app targets groups of people who want to plan efficiently and enjoy activities together (friends, families, co-workers, etc.). TripAdvisor is a similar application where groups can plan trips and make an itinerary together. The limitation of TripAdvisor is that there is no feature that collects an individual’s interests and preferences and builds an optimized plan. Our app addresses this problem by allowing you to invite friends, collect personal preferences and interests, and the program builds an optimized, detailed outing plan for you.

---

## Technical Stack

* **Architecture:** Client-Server Model
* **Frontend:** Angular + TypeScript
* **Backend:** Node.js + Express.js + TypeScript
* **Database:** PostgreSQL (via Supabase)
* **APIs:** Google Places, Google Maps, Google Auth, and OpenAI API (ChatGPT)

---

## Key Features

* **Distributed Architecture:** Built a resilient distributed web application using Node.js and Supabase.
* **Custom Version Control:** Designed a system to ensure data integrity for over 100+ profile revisions, allowing groups to track changes in preferences.
* **Generative AI Integration:** Leveraged the ChatGPT API to automate outing plans and summaries.
* **Prompt Optimization:** Implemented advanced prompt engineering to reduce API calls by 50% while maintaining high relevance and accuracy.
* **Social Engagement:** Integrated "Highlights" (Instagram-style feed), an email notification system, and user preference collection to drive user engagement.

---

## Installation

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* npm (comes with Node.js)
* [Angular CLI](https://angular.io/cli) (`npm install -g @angular/cli`)

### 1. Clone the Repository
```bash
git clone [https://github.com/yourusername/VibeCheck.git](https://github.com/yourusername/VibeCheck.git)
cd VibeCheck

```

### 2. Backend Setup

```bash
cd backend
npm install

```

> [!IMPORTANT]
> **Environment Variables:** You must create a `.env` file in the `/backend` directory.
> You need to add your own `OPENAI_API_KEY` to this file, along with your Supabase and Google API credentials, for the server to function.

### 3. Frontend Setup

```bash
cd ../frontend
npm install

```

### 4. Running the Application

**Start the Backend Server:**

```bash
cd backend
npm run dev

```

**Start the Frontend Client:**

```bash
cd frontend
ng serve

```

Navigate to `http://localhost:4200/` in your browser.

---

## Challenges & Solutions

* **Learning Curve:** Rapidly adopted the Angular framework and TypeScript to build a type-safe, scalable frontend.
* **API Integration:** Overcame hurdles in fetching and handling complex geospatial data from the Google Maps API to provide accurate location recommendations.
* **System Architecture:** Maintained a clean, organized interaction between the Angular frontend and the Node/PostgreSQL backend as the application’s complexity increased.
* **Cost Management:** Balanced the need for high-quality, accurate results with budget constraints by optimizing OpenAI API calls to be more cost-effective for production.

---

## Authors

* **Jeongbin Lee** - Team Lead / Scrum Master
* **Meet Patel**
* **Ji Bing Ni**
* **Hosung (Dennis) Ryu**
