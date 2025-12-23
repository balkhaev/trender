# Trender User Flows Documentation
This document outlines the primary user scenarios and interaction flows for the Trender application, as captured from the Figma prototype.
---
## 1. Onboarding & Authentication
The gateway for new users to understand the value proposition and create an account.
### Flow:
1. **Splash Screen**: Brand introduction (Logo + "Create • Go Viral").
2. **Welcome Screen**: Sign-in options via Google or Apple.
3. **Feature Carousel**: Three-step educational tour:
    - **Create**: "Make unique content from trending videos."
    - **Customize**: "Change everything: characters, backgrounds, styles."
    - **Viral**: "One-tap sharing to Instagram, TikTok, and YouTube."
4. **Landing**: User arrives at the **Trends** (Home) feed.
---
## 2. Content Creation: "Remix a Trend"
The core engine of Trender, allowing users to leverage viral templates.
### Flow:
1. **Browse Trends**: User scrolls the Trends feed (grid view) and selects a template.
2. **Template Detail**: Preview the original video, view stats, and bookmark if desired.
3. **Action**: User taps **"Create my version"**.
4. **Editor**:
    - **Simple Mode**: Quick selection of characters (e.g., Spider-Man, Shark), backgrounds, and styles from a list.
    - **Expert Mode**: Use text prompts to describe custom changes for character/background.
5. **Generation**: Progress screen showing AI processing (Analysis -> Character Gen -> Rendering).
6. **Result**: Preview the generated video.
7. **Publish**: Option to **"Publish to Reels"** and/or **"Share with community"**.
---
## 3. Content Discovery & Community
Engaging with the community and finding inspiration.
### Scenarios:
- **Community Feed**: Switch from "Trends" to "Community" tab to see what others have created.
- **Search**: Find specific trends or community videos using keywords.
- **Bookmarking**: Save templates or community videos for later use (appears in Profile).
---
## 4. Custom Creation: URL / File Import
For users who want to remix a video not currently in the Featured Trends.
### Flow:
1. **Start**: Tap the central **"+" (Plus)** button on the navigation bar.
2. **Import**:
    - **Paste Link**: Input a URL from Instagram, TikTok, or YouTube Shorts.
    - **Upload**: Select a video file from the device's library.
3. **Process**: Transitions into the same **Editor** flow as "Remix a Trend".
---
## 5. Profile & Account Management
Managing personal content, preferences, and subscriptions.
### Sections:
- **Generation History**: A gallery of all videos previously created by the user.
- **Bookmarks**: Collection of saved trends and community videos.
- **Premium Subscription**: 
    - Promotes "Max Accuracy" models and "Unlimited Generations".
    - Includes "Restore Purchases" and subscription tier selection.
- **Settings/Legal**: Access to Privacy Policy and Terms of Service.
---
## Visual Summary (Mermaid)
```mermaid
graph TD
    A[Splash] --> B[Login]
    B --> C[Feature Carousel]
    C --> D[Trends Feed]
    
    D --> E[Select Trend]
    E --> F[Template Detail]
    F --> G[Editor: Simple/Expert]
    G --> H[AI Generation]
    H --> I[Preview & Publish]
    
    D --> J[Community Feed]
    D --> K[+]
    K --> L[Upload / URL Import]
    L --> G
    
    D --> M[Profile]
    M --> N[History]
    M --> O[Bookmarks]
    M --> P[Premium]
