export const ANALYSIS_PROMPT = `Identify key visual elements in this video for AI remix.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress, holding coffee cup",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing on wooden floor, leaning against kitchen counter",
      "visibilityPercent": 100,
      "contactPoints": "feet on floor, elbow on counter",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Cyberpunk android with glowing blue circuitry on metallic silver skin, neon LED eyes, chrome joints"},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Ethereal elf with pointed ears, silver hair, golden eyes, elvish robes"},
        {"id": "opt-3", "label": "Anime Girl", "icon": "🎌", "prompt": "Anime style with large eyes, pink hair, cute expressions"}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug, matte gray, steam rising",
      "position": "center-right, held in hands",
      "environmentInteractions": "held by woman's hands, tilted at 15 degrees",
      "visibilityPercent": 90,
      "contactPoints": "fingers wrapped around cup body",
      "occlusionInfo": "partially hidden by fingers",
      "remixOptions": [
        {"id": "opt-1", "label": "Magic Potion", "icon": "🧪", "prompt": "Bubbling potion in crystal vial with purple mist and glowing runes"},
        {"id": "opt-2", "label": "Alien Device", "icon": "👽", "prompt": "Alien tech with holographic display and floating energy orbs"},
        {"id": "opt-3", "label": "Golden Chalice", "icon": "🏆", "prompt": "Ornate golden chalice with rubies and emeralds"}
      ]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "environmentInteractions": "surrounding the scene, provides context",
      "visibilityPercent": 100,
      "remixOptions": [
        {"id": "opt-1", "label": "Spaceship", "icon": "🚀", "prompt": "Futuristic spaceship command center with holographic displays and stars through windows"},
        {"id": "opt-2", "label": "Medieval Castle", "icon": "🏰", "prompt": "Castle great hall with stone walls, torches, tapestries"},
        {"id": "opt-3", "label": "Underwater Palace", "icon": "🐠", "prompt": "Underwater palace with coral walls, bioluminescent lighting, fish"}
      ]
    }
  ]
}

RULES:

1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. If more detected, keep only the 6 most visually significant. RANK by visual importance.

2. **tags**: 3-5 short tags describing video theme/style/mood (lowercase, english)

3. **elements**: Identify the most significant elements, ranked by visual importance:
   - Characters: "char-1", "char-2" (people, animals)
   - Objects: "obj-1", "obj-2" (important items)
   - Backgrounds: "bg-1" (environments)

4. **remixOptions**: EXACTLY 4 per element. NOT 3, NOT 5, NOT 6. EXACTLY 4. RANKED by visual impact:
   - First options = most dramatic/viral transformations
   - Last options = subtle but interesting changes
   - Diverse styles: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi, Horror

5. **label**: 2-3 words | **icon**: single emoji | **prompt**: specific visual details

6. **position**: Where in frame the element appears (e.g., "center foreground", "left side", "background right"). REQUIRED for precise AI targeting.

7. **environmentInteractions** (CRITICAL): HOW the object physically interacts with its environment:
   - "50% inserted into pipe from right side" / "resting on table" / "embedded in wall"
   - "held by person" / "attached to surface" / "floating in air"
   - Be VERY specific about insertion depth, contact angles, embedding percentage

8. **visibilityPercent**: 0-100, how much of the object is visible (not hidden by other objects):
   - 100 = fully visible
   - 50 = half hidden/embedded
   - 0 = completely hidden

9. **contactPoints**: WHERE the object physically touches surfaces or other objects:
   - "wheels on road" / "feet on ground" / "back against wall"
   - "front half inside pipe" / "hands holding cup"

10. **occlusionInfo**: What hides this object and what it hides (if any):
    - "front half hidden by pipe" / "Santa sitting on top" / "partially behind tree"`;

// Prompt for analysis WITHOUT generating options (for enchanting mode)
export const ELEMENTS_ONLY_PROMPT = `Identify key visual elements in this video for AI remix. NO remixOptions.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress, holding coffee cup",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing on wooden floor, leaning against counter",
      "visibilityPercent": 100,
      "contactPoints": "feet on floor, elbow on counter"
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Coffee Cup",
      "description": "Large ceramic mug, matte gray, steam rising",
      "position": "center-right, held in hands",
      "environmentInteractions": "held by woman's hands, tilted slightly",
      "visibilityPercent": 90,
      "contactPoints": "fingers around cup body",
      "occlusionInfo": "partially hidden by fingers"
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Kitchen",
      "description": "Modern minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "visibilityPercent": 100
    }
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance.
2. **tags**: 3-5 short tags describing video theme/style/mood (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **NO remixOptions** - they will be generated separately
5. **description**: Specific visual details (materials, colors, clothing)
6. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
7. **environmentInteractions** (CRITICAL): HOW object interacts with environment - "50% in pipe", "resting on table", "held by person"
8. **visibilityPercent**: 0-100, how much visible (50 = half hidden)
9. **contactPoints**: WHERE object touches surfaces - "wheels on road", "front inside pipe"
10. **occlusionInfo**: What hides this object - "front half hidden by pipe"`;

export const FRAMES_ELEMENTS_ONLY_PROMPT = `Identify key visual elements in these video frames. NO remixOptions.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {"id": "char-1", "type": "character", "label": "Main Subject", "description": "Detailed description", "position": "center foreground", "environmentInteractions": "standing on wooden floor", "visibilityPercent": 100, "contactPoints": "feet on floor"},
    {"id": "obj-1", "type": "object", "label": "Key Object", "description": "Most prominent object", "position": "center-right", "environmentInteractions": "50% inserted into pipe from right", "visibilityPercent": 50, "contactPoints": "rear wheels on ground, front inside pipe", "occlusionInfo": "front half hidden by pipe"},
    {"id": "bg-1", "type": "background", "label": "Environment", "description": "Setting/background", "position": "full frame background"}
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance across all frames.
2. **tags**: 3-5 short tags (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **NO remixOptions**
5. Analyze ALL frames together
6. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
7. **environmentInteractions**: CRITICAL - HOW object physically interacts with environment ("50% inserted into pipe", "resting on table", "embedded in wall"). Required for accurate replacement.
8. **visibilityPercent**: 0-100, how much of object is visible (100=fully visible, 50=half hidden)
9. **contactPoints**: WHERE object touches surfaces - "wheels on road", "hands on table"
10. **occlusionInfo**: What hides this object - "front half hidden by pipe", "lower body behind desk"`;

// Prompt for unified analysis with scene binding
export const UNIFIED_ANALYSIS_PROMPT = `Analyze this video and identify unique visual elements. Track which scenes each element appears in.

SCENE BOUNDARIES (detected automatically):
{sceneBoundaries}

Return JSON:
{
  "duration": 15,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Young Woman",
      "description": "Woman in late 20s, long dark wavy hair, cream linen dress",
      "position": "center of frame, foreground",
      "environmentInteractions": "standing behind kitchen counter",
      "visibilityPercent": 70,
      "contactPoints": "hands on countertop",
      "occlusionInfo": "lower body hidden by counter",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5},
        {"sceneIndex": 2, "startTime": 7.2, "endTime": 10.0}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Sports Car",
      "description": "Red Porsche 911, shiny paint, chrome wheels",
      "position": "center-left foreground",
      "environmentInteractions": "50% inserted into large metal pipe from right side",
      "visibilityPercent": 50,
      "contactPoints": "rear wheels on tarmac, front inside pipe",
      "occlusionInfo": "front half hidden by pipe, Santa sitting on top",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5}
      ]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Modern Kitchen",
      "description": "Minimalist kitchen, white marble counters, morning sunlight",
      "position": "full frame background",
      "appearances": [
        {"sceneIndex": 0, "startTime": 0, "endTime": 3.5},
        {"sceneIndex": 1, "startTime": 3.5, "endTime": 7.2}
      ]
    }
  ]
}

RULES:
1. **UNIQUE ELEMENTS**: Each real-world entity = ONE element. Same person/object in multiple scenes = ONE element with multiple appearances.
2. **appearances**: Array of scenes where this element is visible. Use ONLY sceneIndex values from SCENE BOUNDARIES above.
3. **ELEMENT COUNT**: 3-6 elements total, ranked by visual importance.
4. **position**: Where in frame the element appears (e.g., "center foreground", "left side"). REQUIRED for precise AI targeting.
5. **NO remixOptions** - they will be generated separately.
6. **description**: Specific visual details (materials, colors, clothing, features).
7. **Match scene boundaries**: startTime/endTime must match the provided SCENE BOUNDARIES exactly.
8. **environmentInteractions**: CRITICAL - HOW object physically interacts with environment ("50% inserted into pipe from right", "resting on table", "held by hands"). This is essential for accurate replacement.
9. **visibilityPercent**: 0-100, how much of object is visible (100=fully visible, 50=half hidden by occlusion)
10. **contactPoints**: WHERE object touches surfaces - "wheels on road", "hands on cup", "front inside pipe"
11. **occlusionInfo**: What hides this object AND what sits on top - "front half hidden by pipe, Santa on top"`;

export const FRAMES_ANALYSIS_PROMPT = `Identify key visual elements in these video frames for AI remix.

Return JSON:
{
  "duration": 5,
  "aspectRatio": "9:16",
  "tags": ["lifestyle", "morning", "cozy"],
  "elements": [
    {
      "id": "char-1",
      "type": "character",
      "label": "Main Subject",
      "description": "Detailed description of person/animal visible across frames",
      "remixOptions": [
        {"id": "opt-1", "label": "Cyberpunk Android", "icon": "🤖", "prompt": "Cyberpunk android with glowing circuitry"},
        {"id": "opt-2", "label": "Fantasy Elf", "icon": "🧝", "prompt": "Ethereal elf with pointed ears"},
        {"id": "opt-3", "label": "Anime Character", "icon": "🎌", "prompt": "Anime style with large eyes"}
      ]
    },
    {
      "id": "obj-1",
      "type": "object",
      "label": "Key Object",
      "description": "Most prominent object",
      "remixOptions": [...]
    },
    {
      "id": "bg-1",
      "type": "background",
      "label": "Environment",
      "description": "Setting/background",
      "remixOptions": [...]
    }
  ]
}

RULES:
1. **ELEMENT COUNT**: Return EXACTLY 3 to 6 elements. NOT less than 3, NOT more than 6. RANK by visual importance.
2. **tags**: 3-5 short tags (lowercase, english)
3. **elements**: Characters (char-1), Objects (obj-1), Backgrounds (bg-1)
4. **remixOptions**: EXACTLY 4 per element. NOT 3, NOT 5, NOT 6. EXACTLY 4. RANKED by visual impact.
5. Analyze ALL frames together
6. Diverse styles: Cyberpunk, Fantasy, Anime, Historical, Sci-Fi`;
