# Knight Character Design Documentation

## Overview

This document outlines the design and implementation of a 14th century knight persona for the Mindcraft Minecraft bot, including advanced memory systems, dynamic meta-goals, and concurrent response capabilities.

## Table of Contents

1. [Action Chaining Architecture](#action-chaining-architecture)
2. [Self-Prompter System](#self-prompter-system)
3. [Memory and Context Management](#memory-and-context-management)
4. [Dynamic Meta-Goal System](#dynamic-meta-goal-system)
5. [Database-Backed Memory System](#database-backed-memory-system)
6. [Time-Budget Response System](#time-budget-response-system)
7. [Concurrent Response System](#concurrent-response-system)
8. [Implementation Strategies](#implementation-strategies)
9. [Codebase Analysis](#codebase-analysis)

---

## Action Chaining Architecture

### Current System Analysis

The Mindcraft bot chains individual actions through a **multi-layered action system**:

#### 1. Action Manager (`src/agent/action_manager.js`)
- **Central execution controller** managing action lifecycle
- Enforces **sequential execution** - only one action at a time via `executing` flag
- Provides **timeout handling** and **interrupt mechanisms** for stuck actions
- Implements **anti-infinite-loop protection** with action frequency monitoring

#### 2. Three Levels of Actions

**Level 1: Predefined Commands** (`src/agent/commands/actions.js`)
```javascript
{
    name: '!collectBlocks',
    perform: runAsAction(async (agent, type, num) => {
        await skills.collectBlock(agent.bot, type, num);
    }, false, 10) // 10 minute timeout
}
```

**Level 2: Skills Library** (`src/agent/library/skills.js`)
- Low-level atomic actions like `craftRecipe`, `goToPosition`, `placeBlock`
- Direct bot control functions

**Level 3: Generated Code** (`src/agent/coder.js`)
```javascript
(async (bot) => {
    await skills.collectBlock(bot, "oak_log", 64);
    await skills.craftRecipe(bot, "stick", 8);
    await skills.placeBlock(bot, "torch", pos.x, pos.y, pos.z);
    log(bot, 'Code finished.');
})
```

#### 3. Task System (`src/agent/tasks/tasks.js`)
- **High-level task coordination** with validation and progress tracking
- Manages **multi-agent collaboration** for complex tasks
- Handles **initial setup** (inventory, teleportation) and **goal setting**

### Execution Flow

1. **Task initiation**: Tasks loaded with goals, inventories, agent coordination
2. **Goal-driven prompting**: Self-prompter generates action requests based on current state
3. **Command parsing**: Natural language converted to specific action commands
4. **Action execution**: ActionManager ensures safe, sequential execution
5. **Skill chaining**: Individual actions use await to chain primitive operations
6. **Validation**: Task validators check completion criteria
7. **Modes**: Background modes handle reactive behaviors

**Key insight**: Actions chain through **async/await sequences** at the code level, **command sequences** at the action level, and **goal-driven iteration** at the task level.

---

## Self-Prompter System

The **Self Prompter** (`src/agent/self_prompter.js`) enables autonomous goal-pursuit without human intervention.

### Core Functionality

#### State Management
```javascript
const STOPPED = 0
const ACTIVE = 1
const PAUSED = 2
```

#### Goal-Driven Loop
When started with a goal like "collect wood and build a house":

1. **Monitors idle state** - Waits for current actions to complete
2. **Generates prompts** - Uses AI to decide next steps toward the goal
3. **Triggers actions** - Executes the chosen action
4. **Repeats continuously** until goal accomplished or stopped

#### The Core Loop Pattern (`src/agent/self_prompter.js:66`)
```javascript
const msg = `You are self-prompting with the goal: '${this.prompt}'. Your next response MUST contain a command with this syntax: !commandName. Respond:`;
```

### Integration Points

- **ActionManager coordination**: Pauses during active actions to avoid conflicts
- **Task integration**: Tasks automatically start self-prompting with specific objectives
- **Anti-spam protection**: Built-in cooldown periods between prompts
- **Context awareness**: Uses full conversation history for decision-making

### Goal Storage

The goal is **explicitly stored and injected** into each self-prompt:
```javascript
export class SelfPrompter {
    constructor(agent) {
        this.prompt = '';  // The goal is stored here
    }
}
```

Each self-prompt iteration **explicitly injects the stored goal** rather than relying on conversation history inference.

---

## Memory and Context Management

### History Object (`src/agent/history.js`)

The system uses a **History class** that manages conversation context through a **sliding window approach**:

```javascript
export class History {
    constructor(agent) {
        this.turns = [];           // Current conversation window
        this.memory = '';          // Summarized long-term memory
        this.max_messages = 15;    // Default context window
        this.summary_chunk_size = 5; // How many to summarize at once
    }
}
```

### Context Window Management

**Automatic summarization when hitting limits:**
```javascript
async add(name, content) {
    this.turns.push({role, content});

    if (this.turns.length >= this.max_messages) {
        // Remove oldest 5 messages
        let chunk = this.turns.splice(0, this.summary_chunk_size);

        // Summarize them into memory
        await this.summarizeMemories(chunk);

        // Archive to full history file
        await this.appendFullHistory(chunk);
    }
}
```

### Memory Size Limits

**Memory growth is capped at 500 characters:**
```javascript
async summarizeMemories(turns) {
    this.memory = await this.agent.prompter.promptMemSaving(turns);

    if (this.memory.length > 500) {
        this.memory = this.memory.slice(0, 500);
        this.memory += '...(Memory truncated to 500 chars)';
    }
}
```

### Complete Context Structure

Each LLM prompt receives:
1. **Current conversation window** (last ~15 messages)
2. **Compressed memory** (summary of older messages)
3. **Dynamic context** (stats, inventory, world state, etc.)
4. **Examples** (relevant conversation/coding examples)

### Crafting Knowledge System

The system uses the **minecraft-data** npm package for complete recipe knowledge:
```javascript
export function getItemCraftingRecipes(itemName) {
    let itemId = getItemId(itemName);
    if (!mcdata.recipes[itemId]) return null;

    let recipes = [];
    for (let r of mcdata.recipes[itemId]) {
        // Process ingredients and create recipe objects
    }
    return recipes;
}
```

---

## Dynamic Meta-Goal System

### Character Psychology Engine

Instead of static goals, generate meta-goals dynamically based on character history:

#### Character Memory & Event Tracking
```javascript
export class CharacterMemory {
    constructor(agent) {
        this.formative_events = []; // Major life-changing events
        this.core_beliefs = new Map(); // Beliefs with strength values
        this.relationships = new Map(); // Player relationships with context
        this.recent_events = []; // Last 7 days of significant events
        this.daily_reflections = []; // Previous meta-goal generation results
    }

    recordEvent(event_type, description, participants = [], significance = 1) {
        const event = {
            type: event_type,
            description,
            participants,
            timestamp: Date.now(),
            significance, // 1-10 scale
            emotional_impact: this.assessEmotionalImpact(event_type, participants)
        };

        this.recent_events.push(event);

        if (significance >= 8) {
            this.formative_events.push(event);
        }

        this.updateBeliefs(event);
        this.updateRelationships(event, participants);
    }
}
```

#### Dynamic Meta-Goal Generation
```javascript
export class MetaGoalGenerator {
    async generateDailyMetaGoals() {
        console.log('Knight awakens - reflecting on duties and recent events...');

        const context = await this.gatherComprehensiveContext();
        const prompt = this.buildMetaGoalPrompt(context);

        const response = await this.agent.prompter.sendRequest([
            { role: 'system', content: 'Generate meta-goals for a medieval knight based on their history and current situation.' },
            { role: 'user', content: prompt }
        ], 'meta_goal_generation');

        return this.parseMetaGoalResponse(response);
    }
}
```

### Example Evolution

**Day 1**: Standard knight goals
```json
{
  "meta_goals": [
    {"name": "glorify_god", "priority": 6},
    {"name": "protect_realm", "priority": 7},
    {"name": "train_combat", "priority": 4}
  ]
}
```

**Day 5**: After squire dies repeatedly
```json
{
  "meta_goals": [
    {"name": "safeguard_squire", "priority": 10, "emotional_driver": "guilt_over_recent_failures"},
    {"name": "fortify_training_grounds", "priority": 8},
    {"name": "seek_divine_guidance", "priority": 7}
  ],
  "reflection": "Recent losses weigh heavy on my soul. My sacred duty to protect those under my care must take precedence over all else."
}
```

---

## Database-Backed Memory System

### Never-Forgetting Memory Architecture

A **Retrieval-Augmented Generation (RAG)** system for conversational memory:

#### Memory Database Schema
```javascript
export class MemoryDatabase {
    init_database() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS memory_entries (
                id INTEGER PRIMARY KEY,
                timestamp INTEGER,
                summary TEXT,
                participants TEXT, -- JSON array
                tags TEXT,         -- JSON array
                importance INTEGER, -- 1-10 scale
                event_type TEXT,   -- conversation, combat, construction, etc
                embedding BLOB,    -- Vector embedding for similarity search
                raw_turns TEXT     -- Original conversation turns (JSON)
            )
        `);
    }
}
```

#### Smart Memory Chunking
```javascript
async processMemoryChunk() {
    const chunk = this.turns.splice(0, this.summary_chunk_size);

    // Use fast LLM to analyze the chunk
    const analysis = await this.fast_llm.analyzeChunk(chunk, {
        agent_name: this.agent.name,
        current_context: this.agent.getCurrentContext()
    });

    // Store in database with rich metadata
    await this.memory_db.addMemoryEntry(
        chunk,
        analysis.summary,
        analysis.tags,
        analysis.importance,
        analysis.event_type
    );
}
```

#### Context-Aware Memory Retrieval
```javascript
async retrieveRelevantMemories(query, context, urgency = 'normal') {
    if (urgency === 'immediate') {
        return []; // Skip retrieval for combat/urgent decisions
    }

    const search_plan = await this.fast_llm.planMemorySearch(query, context);

    let relevant_memories = [];

    // 1. Keyword/tag-based retrieval
    // 2. Participant-based retrieval
    // 3. Semantic similarity search
    // 4. Temporal retrieval (recent events)

    return this.rankAndDeduplicate(relevant_memories, query, context);
}
```

---

## Time-Budget Response System

### Dynamic Model Selection Based on Time Constraints

#### Model Tier Configuration
```javascript
export class ModelTiers {
    constructor() {
        this.tiers = {
            'instant': {
                models: ['gpt-4o-mini', 'claude-3-haiku'],
                avg_response_time: 800,
                cost_per_1k_tokens: 0.0001,
                use_case: 'combat, urgent safety'
            },
            'fast': {
                models: ['gpt-4o', 'claude-3-sonnet'],
                avg_response_time: 2500,
                cost_per_1k_tokens: 0.003,
                use_case: 'immediate help, quick decisions'
            },
            'thoughtful': {
                models: ['gpt-4', 'claude-3-opus'],
                avg_response_time: 12000,
                cost_per_1k_tokens: 0.03,
                use_case: 'deep planning, storytelling'
            }
        };
    }
}
```

#### Time-Budget Handler
```javascript
async handleMessage(username, message, time_budget_ms = null) {
    const budget = time_budget_ms || await this.calculateTimeBudget(message, username);

    // Assess message complexity
    const complexity_score = await this.assessComplexity(message, username);

    // Select model tier based on budget and complexity
    const [tier_name, tier_config] = this.model_tiers.selectTierForBudget(budget, complexity_score);

    // Reserve time for model generation
    const model_time_estimate = this.response_time_tracker.estimateModelTime(tier_name, message.length);
    const retrieval_budget = Math.max(0, budget - model_time_estimate - 300);

    // Build context within budget and token constraints
    const context = await this.buildContextWithinBudget(
        message,
        retrieval_budget,
        start_time,
        tier_config.max_context_tokens
    );

    return await this.generateWithSelectedModel(selected_model, message, context, remaining_time);
}
```

#### Progressive Context Building
```javascript
async buildContextWithinBudget(message, time_budget_ms, start_time, max_context_tokens) {
    const retrieval_tasks = this.planRetrievalTasks(message);

    // Execute tasks in priority order until budget exhausted
    for (const task of retrieval_tasks) {
        const elapsed = Date.now() - start_time;
        const remaining_budget = time_budget_ms - elapsed;

        if (remaining_budget < task.estimated_time) {
            console.log(`Skipping ${task.type} - insufficient time`);
            break;
        }

        const result = await this.executeRetrievalTask(task, message);
        this.mergeTaskResult(context, task.type, result);
    }

    return context;
}
```

### Budget-to-Model Examples

**Combat (1000ms budget):**
- Selected: gpt-4o-mini (~800ms)
- Context: recent_turns only (200ms retrieval)

**Complex Planning (15000ms budget):**
- Selected: claude-3-opus (~12000ms for complex reasoning)
- Context: Full retrieval pipeline (3000ms)

---

## Concurrent Response System

### Dual-Track Response Strategy

#### Response Strategy Types
```javascript
async handleMessage(username, message, time_budget_ms = null) {
    const strategy = await this.selectResponseStrategy(message, username, time_budget_ms);

    switch (strategy.type) {
        case 'immediate_only':
            return await this.immediateResponse(message, strategy);

        case 'immediate_then_followup':
            return await this.dualTrackResponse(message, strategy);

        case 'thoughtful_only':
            return await this.thoughtfulResponse(message, strategy);
    }
}
```

#### Dual-Track Implementation
```javascript
async dualTrackResponse(message, strategy) {
    // Track 1: Immediate response
    const immediate_promise = this.generateImmediateResponse(message, {
        budget: strategy.immediate_budget,
        model_tier: 'fast',
        context_level: 'minimal'
    });

    // Track 2: Deep response (background)
    const deep_task_id = this.generateTaskId();
    const deep_promise = this.generateDeepResponse(message, {
        budget: strategy.followup_budget,
        model_tier: 'thoughtful',
        context_level: 'comprehensive'
    });

    // Return immediate response right away
    const immediate_result = await immediate_promise;

    // Set up follow-up delivery
    this.setupFollowupDelivery(deep_task_id, message.username);

    return immediate_result;
}
```

#### Example Flow
**User:** "What should we build next? I'm thinking maybe we need better defenses since those raiders keep attacking."

**Immediate Track (2 seconds):**
```
Knight: "Aye, defenses are wise. Let me start gathering stone for walls. *thinking deeper...*"
[Starts !collectBlocks("cobblestone", 64)]
```

**Deep Track (15 seconds later):**
```
Knight: "On further reflection... having studied our past battles, I recall the raiders always attack from the eastern pass. A strategic watchtower there would serve us better than simple walls..."
```

---

## Implementation Strategies

### Working Within Existing System

#### Event-Driven Contextual Dialogue
```javascript
// In agent initialization - add event listeners
async start() {
    // Combat dialogue events
    this.bot.on('entityHurt', (entity) => {
        if (entity === this.bot.entity) {
            this.triggerContextualDialogue('took_damage', { damage: entity.metadata[7] });
        }
    });

    // Movement dialogue events
    this.bot.on('move', () => {
        if (this.actions.currentActionLabel.includes('goTo') && this.shouldTriggerTravelDialogue()) {
            this.triggerContextualDialogue('traveling', { destination: this.current_destination });
        }
    });
}
```

#### Modified ActionManager - Pausable Actions
```javascript
async runAction(actionLabel, actionFn, options = {}) {
    // Check if we can pause current action for quick dialogue
    if (this.executing && this.canPauseCurrentAction() && options.dialogue_priority) {
        await this.pauseCurrentAction();

        // Handle dialogue quickly
        const result = await this._executeAction(actionLabel, actionFn, options.timeout || 2);

        // Resume paused action
        await this.resumePausedAction();
        return result;
    }

    return await this._executeAction(actionLabel, actionFn, options.timeout);
}
```

#### Enhanced Skills with Dialogue Hooks
```javascript
export async function goToPosition(bot, x, y, z, closeness = 1) {
    bot.pathfinder.setGoal(new pf.goals.GoalNear(x, y, z, closeness));

    let last_dialogue_check = Date.now();

    return new Promise((resolve, reject) => {
        const checkProgress = () => {
            const now = Date.now();
            const distance = bot.entity.position.distanceTo({x, y, z});

            // Every 10 seconds during travel, allow for dialogue
            if (now - last_dialogue_check > 10000) {
                bot.emit('travel_progress', { distance, elapsed: now - travel_start });
                last_dialogue_check = now;
            }

            if (distance <= closeness) {
                resolve();
            } else {
                setTimeout(checkProgress, 1000);
            }
        };

        checkProgress();
    });
}
```

### Multi-Track Asynchronous System

#### Track-Based Agent Architecture
```javascript
export class MultiTrackAgent extends Agent {
    constructor() {
        super();
        this.tracks = {
            action: new ActionTrack(this),      // Long-running actions
            dialogue: new DialogueTrack(this),  // Conversational responses
            reactive: new ReactiveTrack(this),  // Immediate reactions
            ambient: new AmbientTrack(this)     // Background behaviors
        };
        this.track_coordinator = new TrackCoordinator(this.tracks);
    }

    async handleMessage(username, message) {
        const routing = await this.track_coordinator.routeMessage(message, username);

        // Execute tracks concurrently
        const track_promises = routing.tracks.map(async (track_name) => {
            const track = this.tracks[track_name];
            return await track.processMessage(message, username, routing.config[track_name]);
        });

        const track_results = await Promise.allSettled(track_promises);
        return this.track_coordinator.coordinateResponses(track_results, routing);
    }
}
```

### Scenario Analysis

#### Scenario 1: Combat Commentary
**Current System:**
- Knight executes `!attack("zombie")`
- `this.executing = true` BLOCKS everything else
- Knight is silent until zombie dies (30+ seconds)

**Modified System:**
- Combat never stops or pauses
- Event listeners generate dialogue during ongoing combat
- Timeline: "Aye! Death to the undead!" → *3s* "Take this, vile beast!" → *7s* "Argh! You'll pay for that!"

#### Scenario 2: Building + War Stories
**Challenge:** Block placement requires brief pauses for dialogue
**Solution:** Pausable actions or interruptible generated code
**Timeline:** Building → Player asks about wars → Knight pauses placing blocks → "Ah, the siege of Acre..." → Resumes building

#### Scenario 3: Travel + Food Conversation
**Works Best:** Travel continues uninterrupted while chatting
**Timeline:** Knight starts walking → Player asks about food → Knight responds while still walking → Conversation continues during entire journey

---

## Codebase Analysis

### Reusability Assessment (~13,000 Lines, 66 Files)

#### 🟢 KEEP AS-IS (40% of codebase - ~5,200 lines)
| Component | Lines | Why Reusable |
|-----------|-------|--------------|
| **Models/** | ~2,000 | All LLM integrations - just API calls |
| **Utils/** | ~800 | Pure utility functions, no dependencies |
| **Skills Library** | ~1,500 | Core Minecraft actions - universally needed |
| **Memory Bank** | ~200 | Simple data storage - architecture agnostic |
| **Settings** | ~100 | Configuration - just add new options |
| **Vision System** | ~600 | Independent modules |

#### 🟡 MINOR MODIFICATIONS (25% of codebase - ~3,200 lines)
| Component | Lines | Required Changes | Effort |
|-----------|-------|------------------|---------|
| **History System** | ~300 | Add track-aware context | **Low** |
| **Commands/Actions** | ~800 | Route to appropriate tracks | **Low** |
| **NPC System** | ~600 | Multi-track goal handling | **Medium** |
| **Conversation Manager** | ~400 | Track coordination | **Medium** |
| **Self Prompter** | ~200 | Background track integration | **Medium** |
| **Modes System** | ~300 | Track-aware behaviors | **Low** |
| **Task System** | ~600 | Multi-track task execution | **Medium** |

#### 🔴 MAJOR REWRITES (35% of codebase - ~4,500 lines)
| Component | Lines | Why Complete Rewrite |
|-----------|-------|---------------------|
| **ActionManager** | ~180 | Single-action blocking model |
| **Agent.js** | ~300 | Sequential message handling |
| **Coder.js** | ~150 | Blocking code generation |

**Plus New Components Needed (~3,800 lines):**
- TrackCoordinator (~400 lines)
- ActionTrack (~600 lines)
- DialogueTrack (~500 lines)
- ReactiveTrack (~400 lines)
- BackgroundTrack (~300 lines)
- Supporting infrastructure (~1,600 lines)

### Development Effort Summary

| Category | Keep | Modify | Rewrite | New Code |
|----------|------|--------|---------|----------|
| **Lines** | 5,200 | 2,560 | 2,760 | +7,600 |
| **Effort** | Free | Low-Med | High | High |

**Total Estimate: 9-13 weeks** for complete multi-track rewrite

### Strategic Recommendations

#### Hybrid Approach - 3 Phases:

**Phase 1: Strategic Modifications (1-2 months)**
- Event-driven dialogue during actions
- Pausable action system
- Travel conversation hooks
- Combat reaction system
- **Goal**: 80% of experience quickly

**Phase 2: Evaluation (1 month)**
- Test modified system in practice
- Assess pain points and limitations
- Gather user feedback

**Phase 3: Decision Point**
- **If modified system sufficient**: Continue iterating
- **If limitations frustrating**: Implement multi-track system

#### Decision Factors

**Choose existing system if:**
- Limited time/resources
- Knight character is main use case
- Want to ship quickly
- Prefer iterative development

**Choose new architecture if:**
- Part of larger AI companion vision
- Planning multiple complex characters
- Performance and scalability important
- Have 3-6 months for foundational work

### Key Insight

**40% of the most valuable code** (LLM integrations, Minecraft skills, utilities) is completely reusable. The multi-track system would essentially rewrite the "plumbing" while keeping all the expensive domain expertise.

---

## Conclusion

This design provides a comprehensive roadmap for implementing a sophisticated 14th century knight character with:

- **Dynamic personality** that evolves based on experience
- **Perfect memory** that never forgets important events
- **Intelligent response timing** that balances speed and thoughtfulness
- **Concurrent capabilities** for natural dialogue during actions
- **Flexible implementation path** allowing incremental or revolutionary approaches

The system can be implemented either through careful modifications to the existing architecture (faster, lower risk) or through a new multi-track concurrent system (more powerful, longer development time). The choice depends on timeline, resources, and long-term vision for the project.