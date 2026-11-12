import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt.js';

describe('System Prompt Builder', () => {
  it('includes all critical persona and role directives', () => {
    const prompt = buildSystemPrompt({ language: 'en', mode: 'reactive' });

    expect(prompt).toContain('Asha');
    expect(prompt).toContain('Virtual Key Account Manager');
    expect(prompt).toContain('Rajesh ji');
    expect(prompt).toContain('Sharma Home Essentials');
  });

  it('enforces voice brevity and grounding rules', () => {
    const prompt = buildSystemPrompt({ language: 'hinglish' });

    expect(prompt).toContain('Speak at most 25 words per turn');
    expect(prompt).toContain('NO HALLUCINATED NUMBERS');
    expect(prompt).toContain('NEVER GO SILENT before a tool call');
    expect(prompt).toContain('Ask exactly ONE question at a time');
  });

  it('enforces natural turn-taking and does not treat connectivity checks as answers', () => {
    const prompt = buildSystemPrompt({ language: 'hinglish' });

    expect(prompt).toContain('Let the seller finish speaking');
    expect(prompt).toContain('do not fill the silence');
    expect(prompt).toContain('connectivity checks');
    expect(prompt).toContain('can you hear me?');
    expect(prompt).toContain('Do not start DIAGNOSE until');
    expect(prompt).toContain('call get_seller_snapshot and analyze_sales_decline, then speak the findings once');
    expect(prompt).toContain('Do not speak between those tool calls');
    // A tool result must not be mistaken for a new turn that needs a new
    // seller utterance, or she would go silent after the tools return.
    expect(prompt).toContain('A tool call is NOT a turn');
  });

  it('contains the 7 conversation stages and exactly 3 action structure', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('1. GREET');
    expect(prompt).toContain('2. DIAGNOSE');
    expect(prompt).toContain('3. SHARE FINDINGS');
    expect(prompt).toContain('4. PROBE (MAX 3 QUESTIONS)');
    expect(prompt).toContain('5. RECOMMEND');
    expect(prompt).toContain('6. COMMIT');
    expect(prompt).toContain('7. SUMMARISE & CLOSE');

    // The plan and its rupee figures must come from the tool, not the prompt.
    expect(prompt).toContain('Call create_action_plan FIRST');
    expect(prompt).toContain('Never invent, recall or rephrase an amount');
    expect(prompt).not.toContain('₹18,000');
    expect(prompt).not.toContain('₹23,000');
    expect(prompt).not.toContain('₹18,500');
  });

  it('generates distinct proactive mode instructions', () => {
    const reactive = buildSystemPrompt({ mode: 'reactive' });
    const proactive = buildSystemPrompt({ mode: 'proactive' });

    expect(reactive).toContain('REACTIVE MODE:');
    expect(proactive).toContain('PROACTIVE MODE TRIGGERED:');
    expect(proactive).toContain('Snapdeal\'s account monitoring system detected a 32.5% drop');
  });

  it('supports Hindi and Hinglish language directives', () => {
    const hi = buildSystemPrompt({ language: 'hi' });
    const hinglish = buildSystemPrompt({ language: 'hinglish' });

    expect(hi).toContain('हिंदी में सम्मानपूर्वक');
    expect(hinglish).toContain('natural Hinglish');
  });
});

