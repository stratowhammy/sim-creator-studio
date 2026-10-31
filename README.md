# Sim Creator Studio: Antigravity Agent Specification & Alpha Logic Harness

Sim Creator Studio is an autonomous multiplayer asymmetric information simulation engine and authoring platform ("Clue meets Tabletop RPG").

## Architectural Pillars

1. **Epistemic Partitioning Graph & Strict Row-Level Security (RLS)**:
   - Each `InfoCard` and `RagDocumentChunk` maintains a strict `knownByPlayerIds` array.
   - Private advisor channels enforce metadata pre-filtering before keyword/semantic search, guaranteeing zero cross-player information leakage.

2. **Deterministic Mathematical Resolution Engine**:
   - Offense vs. Defense stat matchups (`inquiry` vs `composure`, `coercion` vs `composure`, `negotiation` vs `insight`, `deception` vs `insight`).
   - Dynamic threshold calculation incorporating Stance ($M_{stance}$), Card Protection ($M_{protect}$), and Secrecy penalties ($M_{secrecy}$).
   - Batched pre-roll & delta resolution for $N$ dialogue beats in a single pass ($3 \le N \le 7$).
   - Non-depleting card duplication triggers (Cumulative Momentum $\bar{\Delta} \ge +0.08$ or Breakthrough Spike $\Delta_k \ge 0.25$).
   - Goal completion with exclusivity decay VP multipliers (`[1.0, 0.6, 0.3]`) and automatic `COMPOSITE` card synthesis.

3. **Pre-Game DAG Compiler & Solvability Invariants**:
   - **Zero Self-Sufficiency Invariant**: No player can satisfy any assigned Goal on Turn 0 without trade or interrogation.
   - **Global Reachability Invariant**: 100% of required cards across all goals are covered in the union of player starting hands.
   - **Asymmetric Dependency Seeding**: Every player holds $\ge 2$ leverage cards required by other players' goals.

4. **Multi-Pane Cyber Terminal UI**:
   - **Left Pane (Cols 1-3)**: Player Private Advisor Channel with inline citation pills.
   - **Center Pane (Cols 4-8)**: Interaction Staging Vector & Live $N$-beat dialogue transcript.
   - **Right Pane (Cols 9-12)**: Mystery Goals Tracker, Inventory (Atomic vs Composite), Connection Token bypasses, and Defensive Policy Drawer.
   - **Authoring Studio View**: Master lore atomizer, DAG validator, and character sheet inspector.

## Verification & Test Commands

Run the Headless Alpha Test Harness:
```bash
npx tsx src/alpha/alphaTestRunner.ts
```

Build the production application:
```bash
npm run build
```

Start the Vite development server:
```bash
npm run dev
```
