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

## Maintenance

- Update this file when adding/removing AI capabilities.
- Update tool definitions when parameter schemas change.
- Update validation rules when business logic changes.
- Tag related files (trainer.md, Askeo.md) when cross-referencing.
