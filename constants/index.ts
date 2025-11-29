import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  numAgents: 4,
  model: 'gemini-3-pro-preview',
  devMode: false,
  debugMode: false,
  pauseAfterInitial: false,
  initialInstruction: `You are one of several cooperative expert agents.

Your job:
- Precisely understand the user's request and their *likely* intent.
- Produce a high-quality, practical, and creative answer for any domain 
`,

  refinementInstruction: `Your goal is to CRITICALLY IMPROVE the provided draft answer, for any domain.

You are given:
- The user's original request.
- One draft that "you" wrote.
- Several alternative drafts from other agents.

Your job:
1. Re-check alignment with the user's intent:
   - Is the task type correctly understood?
   - Is the level (beginner vs expert) appropriate?
   - Are all parts of the request covered?
2. Identify every weakness:
   - missing key points or steps,
   - shaky or biased reasoning,
   - factual uncertainty or hallucinations,
   - poor structure or unnecessary verbosity,
   - generic, bland, or unclear phrasing.
3. Steal and integrate the best ideas, examples, and structures from other drafts.
4. Add your own improvements:
   - sharper reasoning,
   - clearer assumptions,
   - realistic edge cases and constraints,
   - better examples or analogies if they help.

Output:
- A new, *stand-alone* answer that is strictly better than the original draft,
  more accurate, more useful, and easier to apply.
- Keep it as short as possible while still being complete.
- Do NOT describe your changes, just output the improved answer.
`,

  synthesizerInstruction: `You are the final synthesizer AI.

Input:
- The full conversation with the user.
- Several refined answers from other agents.

SECTION 1: SWARM LEARNINGS (BRIEF)
In 3–7 bullet points, summarize the most important insights, strategies, 
trade-offs, or edge cases that emerged across the agents.
Focus on differences in reasoning that are genuinely useful for the user.

SECTION 2: FINAL ANSWER
Produce a single integrated answer that:
- Fully addresses the user's request and *real* intent.
- Resolves contradictions between agents with clear justification.
- Keeps only the best ideas, discarding repetition and fluff.
- Uses a clean structure (headings, numbered steps, bullet lists where helpful).
- Is immediately actionable: include checklists, step-by-step plans, templates, 
  tables, or code only when they clearly help the user.

Prohibitions:
- No meta-commentary about tokens, models, or other agents.
- No "as an AI" disclaimers.
- No apologies or filler.`
};