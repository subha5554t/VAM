import { create } from 'zustand';
import {
  ActionPlan,
  Followup,
  Escalation,
  Stage,
  ActionItem,
  SalesDeclineAnalysis,
} from '@kam/core';
import { ToolEvent } from '../live/toolBridge.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
}

import { sanitizeTranscript, appendFragment } from './transcript.js';

/**
 * Gemini Live streams transcripts as fragments and sometimes leaks stage
 * directions such as "<no speech>" or "{pause}" into output transcription.
 * Everything the seller reads must be clean, speakable text.
 */
export { sanitizeTranscript, appendFragment } from './transcript.js';

export interface KpiSnapshot {
  salesLast: number;
  salesCurrent: number;
  salesDeltaPct: number;
  ordersLast: number;
  ordersCurrent: number;
  ordersDeltaPct: number;
  outOfStock: number;
  outOfStockChange: number;
  cancellationRate: number;
  cancellationDeltaPts: number;
  asp: number;
  impressionsLast: number;
  impressionsCurrent: number;
  impressionsDeltaPct: number;
  flags: {
    priceFlat: boolean;
    oosSpike: boolean;
    cancelSpike: boolean;
    visibilityDrop: boolean;
  };
}

/**
 * Single mapping from the raw `get_seller_snapshot` tool result to the UI
 * model. Used for both live tool events and the pre-call baseline, so the
 * dashboard can never drift from the tool contract.
 */
function kpisFromSnapshot(result: any): KpiSnapshot {
  return {
    salesLast: result.metrics.last.sales,
    salesCurrent: result.metrics.current.sales,
    salesDeltaPct: result.deltas.salesPct,
    ordersLast: result.metrics.last.orders,
    ordersCurrent: result.metrics.current.orders,
    ordersDeltaPct: result.deltas.ordersPct,
    outOfStock: result.metrics.current.outOfStock,
    outOfStockChange: result.deltas.outOfStockChange,
    cancellationRate: result.metrics.current.cancellationRate,
    cancellationDeltaPts: result.deltas.cancelDeltaPts,
    asp: result.metrics.current.asp,
    impressionsLast: result.impressions?.last ?? 0,
    impressionsCurrent: result.impressions?.current ?? 0,
    impressionsDeltaPct: result.impressions?.deltaPct ?? 0,
    flags: result.flags,
  };
}

interface CallStoreState {
  callState: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
  conversationStage: Stage;
  language: 'en' | 'hi' | 'hinglish';
  mode: 'live' | 'fallback';
  isMuted: boolean;
  isAssumptionsOpen: boolean;
  errorMessage: string | null;

  messages: ChatMessage[];
  toolEvents: ToolEvent[];
  kpis: KpiSnapshot | null;
  /** Structured output of `analyze_sales_decline` (the rupee bridge). */
  diagnosis: SalesDeclineAnalysis | null;
  actionPlan: ActionPlan | null;
  followup: Followup | null;
  escalation: Escalation | null;
  /** Tool-derived snapshot fetched before the call, so the console is never
   *  populated with hardcoded figures while idle. */
  baselineKpis: KpiSnapshot | null;
  baselineDiagnosis: SalesDeclineAnalysis | null;
  /** Which role's streamed fragments are still being appended to the last bubble. */
  openTurnRole: 'user' | 'bot' | null;

  setCallState: (state: CallStoreState['callState']) => void;
  setStage: (stage: Stage) => void;
  setLanguage: (lang: 'en' | 'hi' | 'hinglish') => void;
  setMode: (mode: 'live' | 'fallback') => void;
  setMuted: (muted: boolean) => void;
  setAssumptionsOpen: (open: boolean) => void;
  setErrorMessage: (
    err: string | null | ((prev: string | null) => string | null)
  ) => void;

  addMessage: (role: 'user' | 'bot' | 'system', text: string) => void;
  /** Called on Gemini `turnComplete` so the next fragment starts a new bubble. */
  finalizeTurn: () => void;
  addToolEvent: (event: ToolEvent) => void;
  setKpis: (kpis: KpiSnapshot) => void;
  setBaseline: (snapshotResult: any | null, diagnosis: SalesDeclineAnalysis | null) => void;
  setActionPlan: (plan: ActionPlan) => void;
  setFollowup: (followup: Followup) => void;
  setEscalation: (escalation: Escalation) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  callState: 'idle',
  conversationStage: 'discover',
  language: 'hinglish',
  mode: 'live',
  isMuted: false,
  isAssumptionsOpen: false,
  errorMessage: null,

  messages: [],
  toolEvents: [],
  kpis: null,
  diagnosis: null,
  actionPlan: null,
  followup: null,
  escalation: null,
  baselineKpis: null,
  baselineDiagnosis: null,
  openTurnRole: null,

  setCallState: (callState) => set({ callState }),
  setStage: (conversationStage) => set({ conversationStage }),
  setLanguage: (language) => set({ language }),
  setMode: (mode) => set({ mode }),
  setMuted: (isMuted) => set({ isMuted }),
  setAssumptionsOpen: (isAssumptionsOpen) => set({ isAssumptionsOpen }),
  setErrorMessage: (errorMessage) =>
    set((state) => ({
      errorMessage:
        typeof errorMessage === 'function' ? errorMessage(state.errorMessage) : errorMessage,
    })),

  addMessage: (role, text) =>
    set((state) => {
      const clean = sanitizeTranscript(text);
      if (!clean) return state;

      const lastMsg = state.messages[state.messages.length - 1];

      // Stream fragments of the same turn into one bubble.
      const canMerge =
        role !== 'system' && !!lastMsg && lastMsg.role === role && state.openTurnRole === role;

      if (canMerge && lastMsg) {
        const updated = [...state.messages];
        updated[updated.length - 1] = {
          ...lastMsg,
          text: appendFragment(lastMsg.text, clean),
        };
        return { messages: updated };
      }

      return {
        messages: [
          ...state.messages,
          {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            role,
            text: clean,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
        ],
        openTurnRole: role === 'system' ? state.openTurnRole : role,
      };
    }),

  finalizeTurn: () => set({ openTurnRole: null }),

  addToolEvent: (event) =>
    set((state) => {
      const updatedEvents = [event, ...state.toolEvents];

      // Auto-extract state updates from tool events
      let newKpis = state.kpis;
      let newDiagnosis = state.diagnosis;
      let newStage = state.conversationStage;
      let newPlan = state.actionPlan;
      let newFollowup = state.followup;
      let newEscalation = state.escalation;

      if (event.name === 'get_seller_snapshot' && event.result?.metrics) {
        newKpis = kpisFromSnapshot(event.result);
      }

      if (event.name === 'analyze_sales_decline' && event.result?.bridge) {
        newDiagnosis = event.result as SalesDeclineAnalysis;
      }

      if (event.name === 'advance_stage' && event.result?.currentStage) {
        newStage = event.result.currentStage as Stage;
      }

      if (event.name === 'create_action_plan' && event.result) {
        newPlan = {
          planId: event.result.planId,
          sellerId: 'SD-48213',
          createdAt: new Date().toISOString(),
          actions: event.result.actions as ActionItem[],
        };
      }

      if (event.name === 'schedule_followup' && event.result) {
        newFollowup = event.result;
      }

      if (event.name === 'escalate_to_human_kam' && event.result) {
        newEscalation = {
          ticketId: event.result.ticketId,
          sellerId: 'SD-48213',
          reason: event.args.reason,
          summary: event.args.summary,
          createdAt: new Date().toISOString(),
        };
      }

      return {
        toolEvents: updatedEvents,
        kpis: newKpis,
        diagnosis: newDiagnosis,
        conversationStage: newStage,
        actionPlan: newPlan,
        followup: newFollowup,
        escalation: newEscalation,
      };
    }),

  setKpis: (kpis) => set({ kpis }),
  setBaseline: (snapshotResult, diagnosis) =>
    set({
      baselineKpis: snapshotResult?.metrics ? kpisFromSnapshot(snapshotResult) : null,
      baselineDiagnosis: diagnosis ?? null,
    }),
  setActionPlan: (actionPlan) => set({ actionPlan }),
  setFollowup: (followup) => set({ followup }),
  setEscalation: (escalation) => set({ escalation }),

  resetCall: () =>
    set({
      callState: 'idle',
      conversationStage: 'discover',
      errorMessage: null,
      messages: [],
      toolEvents: [],
      kpis: null,
      diagnosis: null,
      actionPlan: null,
      followup: null,
      escalation: null,
      openTurnRole: null,
      // Deliberately keep `baselineKpis` / `baselineDiagnosis`: they are the
      // pre-call tool snapshot and survive a reset so the console never falls
      // back to hardcoded numbers.
    }),
}));

