---
last_updated: 2026-08-31
created: 2026-08-31
tags: [ai-coach, capabilities, reference]
related: trainer.md, Askeo.md
---

# AI Coach Capabilities Reference

This is the source of truth for what the AI coach can and cannot do.
Any changes to backend/frontend capability must be reflected here.

## Current Capabilities (Live on Production)

### 1. Conversational Q&A About Training
- Answer questions about the user's workout history, program phase, prescription, recovery, nutrition as it relates to training, exercise form, and progression.
- Load conversation history (last ~20 messages) for context.
- Call user by first name when available.
- Include computed insights: current streak, days since last session, volume trend, top muscle groups.

**Endpoint:** `POST /api/coach/chat`

### 2. Generate Workout Drafts
- Build a new workout plan based on the user's saved fitness profile, with optional overrides (focus, goal, days_per_week, minutes_per_session).
- Respects profile constraints: equipment, limitations, goals, experience, workout_modality.
- Uses deterministic generation engine (`build_full_draft` → `generate_workout`).
- Returns structured workout draft with exercise groups, sets/reps/weight.

**Tool:** `generate_workout` (function calling)

**Frontend:** Displays workout draft as styled card with "Use this workout" button.

### 3. Modify Current Prescription (Tier 2)
- Adjust an existing workout prescription by applying specific changes.
- Supported changes:
  - `next_weight` — positive float
  - `next_reps` — integer 1–20
  - `sets_target` — integer 1–10
  - `swap_exercise` — must exist in exercise library
- Validates all changes before applying:
  - Exercise must be in the user's current prescription
  - New exercise for swap must exist in exercise library
  - No destructive operations without valid replacement
- Returns modified prescription as structured draft with applied changes listed.

**Tool:** `modify_workout` (function calling)

**Frontend:** Displays modified workout with "Modified" badge and change pills.

### 4. Conversation Persistence
- Auto-creates conversation on first chat.
- Stores Q&A pairs in `ai_coach_conversations` + `ai_coach_messages`.
- Loads conversation history on mount.
- Titles conversations from first user message.

**Endpoints:**
- `GET /api/ai-coach/conversations`
- `POST /api/ai-coach/conversations`
- `GET /api/ai-coach/conversations/{id}/messages`
- `POST /api/ai-coach/conversations/{id}/messages`

### 5. Unit Handling
- Reads `user.fitness_profile.units_preference`.
- All weights in LLM context are converted to user's preferred unit before sending.
- System prompt instructs LLM not to double-convert.
- Fallback responses use dynamic unit label (`lbs` or `kg`).

## Manual Equivalents (What the AI can do on user's behalf)

| AI Action | Manual Equivalent |
|-----------|-------------------|
| Generate workout draft | Questionnaire → generate workout |
| Modify prescription | Template editor → edit exercise |
| Swap exercise | Template editor → delete + add exercise |
| Conversation history | Chat screen loads past messages |
| Change units preference | Settings → profile |

## What the AI Cannot Do (Yet)

### Hard Limits
- **Cannot persist workout drafts as templates automatically.** "Use this workout" is UI-only; actual template creation requires manual action or future endpoint.
- **Cannot modify user's fitness profile.** Reading only.
- **Cannot delete templates or exercises.** Read-only for existing plans.
- **Cannot start/log workout sessions.** Read-only for history.
- **Cannot override coach settings** (phase, week, deload mode). Read-only via context.

### Future Capabilities (Not Built)
1. **Create template from draft** — POST `/api/templates` + POST `/api/exercises`
2. **Update fitness profile from chat** — PUT `/api/profile/fitness` with validation
3. **Apply workout modifications to active template** — PUT `/api/templates/{id}` + PUT `/api/exercises/{id}`
4. **Coach settings override from chat** — extend `/api/coach/override` to accept from AI
5. **Log session from chat** — POST `/api/sessions` + POST `/api/sessions/{id}/sets`

## Domain Intent & Guardrails

### App Purpose
Askeo is a **strength and conditioning app**, not a general fitness tracker. Its core value is:
- deterministic progression tracking,
- workout generation constrained by the user's real equipment and limitations,
- and an AI coach that operates within those same constraints.

### Progression Philosophy
- The app tracks **effort + form quality**, not just volume.
- Progression is load-driven; the AI should respect the user's progression profile instead of inventing ad-hoc rules.
- Prescriptions are **inputs for the next session**, not permanent plans. The AI may suggest adjustments, but should not promise outcomes it can't measure.

### In-Scope Topics
The AI should engage deeply with:
- workout programming, exercise selection, sets/reps/weight
- progression logic and load management
- recovery, deload, and injury-aware substitutions
- equipment-aware exercise swaps
- user's training history, trends, and streaks
- form cues and technique as they relate to logged exercises
- profile fields that affect workout generation: goal, equipment, limitations, experience, focus, modality, days_per_week, minutes_per_session, units_preference

### Out-of-Scope Topics
The AI should **decline or redirect**:
- general medical advice, diagnosis, or injury treatment
- nutrition outside the context of training fuel
- supplement dosing or medical protocols
- non-fitness lifestyle coaching (sleep hygiene, mental health, etc.) unless directly tied to training recovery
- creating workouts that ignore the user's equipment/limitations
- inventing exercises not in the exercise library
- promising weight loss, muscle gain, or performance outcomes without data

### Behavioral Boundaries
- **No autonomous writes to user state.** The AI may suggest; the user confirms.
- **No deleting user data.** Swaps require a valid replacement; removals need explicit user request.
- **No hallucinated numbers.** If context is missing, say so instead of guessing weights/reps.
- **No scope creep.** If a request requires manual action outside the app (e.g., "change my iOS notification settings"), say so instead of pretending.
- **Stay in-app.** The AI's world is the user's Askeo data + fitness knowledge. Nothing else.

### Tool Usage Rules
- **`generate_workout`** — only when the user explicitly asks to build/create/generate a workout or program.
- **`modify_workout`** — only when the user explicitly asks to modify/adjust/change/drop/swap/increase/decrease something in their current workout or prescription.
- Both tools must respect `user_profile` constraints automatically. The AI should not override equipment/limitations without user request and explicit confirmation.

## Tool Definitions (For System Prompt)

### generate_workout
```json
{
  "type": "function",
  "function": {
    "name": "generate_workout",
    "description": "Generate a personalized workout plan based on the user's saved fitness profile, with optional overrides. Use this when the user asks you to build, create, or generate a workout, plan, or program.",
    "parameters": {
      "type": "object",
      "properties": {
        "focus": {"type": "string", "description": "Focus area or muscle group to emphasize (e.g., 'upper', 'lower', 'push', 'pull', 'core')"},
        "days_per_week": {"type": "integer", "description": "Override days per week"},
        "minutes_per_session": {"type": "integer", "description": "Override session duration in minutes"},
        "goal": {"type": "string", "description": "Override primary goal (e.g., 'strength', 'hypertrophy', 'endurance', 'weight_loss')"},
        "notes": {"type": "string", "description": "Additional context for the generation"}
      }
    }
  }
}
```

### modify_workout
```json
{
  "type": "function",
  "function": {
    "name": "modify_workout",
    "description": "Modify the user's current workout prescription by applying specific changes. Use this when the user asks to adjust, change, drop, swap, increase, or decrease something in their current workout.",
    "parameters": {
      "type": "object",
      "properties": {
        "current_prescription": {
          "type": "array",
          "items": {"type": "object"},
          "description": "The current prescription array from the context"
        },
        "changes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "exercise": {"type": "string", "description": "Exact exercise name from the prescription"},
              "field": {"type": "string", "enum": ["next_weight", "next_reps", "sets_target", "swap_exercise"]},
              "new_value": {"type": "string", "description": "New value for the field. For swap_exercise, the replacement exercise name."}
            },
            "required": ["exercise", "field", "new_value"]
          },
          "description": "List of changes to apply"
        }
      },
      "required": ["current_prescription", "changes"]
    }
  }
}
```

## Validation Rules

### modify_workout
- Current prescription must exist in context
- Exercise names must match exactly
- `next_weight`: positive float
- `next_reps`: integer 1–20
- `sets_target`: integer 1–10
- `swap_exercise`: must exist in exercise library

## System Prompt Guidelines

The AI coach system prompt instructs:
- Fitness-only focus (decline off-topic questions)
- Check `user_profile.units_preference` first, then follow it for all weights
- Do not lead with workout recap unless explicitly asked
- Be substantive, thoughtful, conversational
- Reference patterns/trends in user's data
- Call `generate_workout` when user asks to build/create/generate a workout
- Call `modify_workout` when user asks to modify/adjust/change/drop/swap/increase/decrease something in their current workout
- Operate within Askeo's domain intent: strength and conditioning, progression-aware, equipment-aware, limitation-aware
- Never invent data, exercises, or outcomes outside the provided context

## Maintenance

- Update this file when adding/removing AI capabilities.
- Update tool definitions when parameter schemas change.
- Update validation rules when business logic changes.
- Update domain intent section when product scope changes.
- Tag related files (trainer.md, Askeo.md) when cross-referencing.
