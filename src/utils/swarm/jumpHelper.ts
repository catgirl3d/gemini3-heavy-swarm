/**
 * Helper for managing "first text chunk" jump behavior in synthesis streaming.
 * 
 * This ensures the jump happens exactly once when the first actual text arrives,
 * regardless of preceding thought/usage chunks from reasoning models.
 * 
 * CRITICAL INVOCATION ORDER:
 * 1. Call tracker.processChunk(text) to detect if this is the trigger chunk.
 * 2. If true, perform any local state transitions (e.g., status to 'working').
 * 3. MANDATORY: Update the global Store (e.g., this.handleStreamChunk) so the new text is visible to UI.
 * 4. MANDATORY: Only AFTER the store is updated, call tracker.executeJump().
 * 
 * RATIONALE:
 * UI components like `ShowWork` observe the Jump event but ALSO verify if actual content
 * is present in the store before collapsing. If the jump is triggered before the store 
 * reflects the new text, the UI will stay expanded, resulting in a failed jump.
 */

export interface FirstTextJumpTracker {
  /** 
   * Process a chunk and determine if jump should trigger.
   * Returns true if this is the first text chunk.
   */
  processChunk: (text: string) => boolean;
  
  /** Reset the tracker (e.g., on retry) */
  reset: () => void;
  
  /** Execute the jump callback if it was provided */
  executeJump: () => void;
}

/**
 * Creates a tracker for first-text-chunk jump behavior.
 * 
 * @param onJump - Optional callback to execute when jump is triggered
 * @returns Tracker object with processChunk, reset, and executeJump methods
 * 
 * @example
 * const jumpTracker = createFirstTextJumpTracker(() => context.onSynthesisJump?.());
 * 
 * onChunk: (text, thought, usage) => {
 *   const shouldJump = jumpTracker.processChunk(text);
 *   if (shouldJump) {
 *     // Update agent status to 'working'
 *   }
 *   this.handleStreamChunk(...); // Update store BEFORE jump
 *   if (shouldJump) {
 *     jumpTracker.executeJump(); // Trigger UI updates AFTER store
 *   }
 * }
 */
export function createFirstTextJumpTracker(onJump?: () => void): FirstTextJumpTracker {
  let triggered = false;
  
  return {
    processChunk: (text: string): boolean => {
      // Only trigger on first non-empty text (ignore thought/usage-only chunks)
      if (!triggered && text.length > 0) {
        triggered = true;
        return true;
      }
      return false;
    },
    
    reset: () => {
      triggered = false;
    },
    
    executeJump: () => {
      onJump?.();
    }
  };
}
