// Public API types for @studio/growth-loop. The package is plain ESM/UMD JS; these
// are hand-written so consumers get types without a TS migration.

export interface DailyDescriptor {
  dayIndex: number;
  seed: number;
  number: number;
  played: boolean;
}

export interface DailyAPI {
  DAY_MS: number;
  /** Monotonic UTC day index (days since Unix epoch). THE day handle. */
  dayIndex(date?: Date): number;
  /** Well-mixed 32-bit RNG seed for the day. Pure function of the date. */
  seedForDate(date?: Date): number;
  /** Well-mixed 32-bit RNG seed for a raw day handle (e.g. from a shared link). */
  seedForDay(dayIndex?: number): number;
  /** Human-facing puzzle number ("#142") relative to configure({epoch}). */
  number(day?: number): number;
  isPlayed(day?: number): boolean;
  playedResult(day?: number): any | null;
  /** One-attempt lock; records the result. Returns the dayIndex. */
  markPlayed(day: number | null | undefined, result: any): number;
  parseLink(search?: string): { d?: number; ref?: string };
  buildLink(base: string, params: { d?: number; ref?: string }): string;
  forDate(date?: Date): DailyDescriptor;
  today(): DailyDescriptor;
}

export interface StreakState { count: number; lastDay: number | null; best: number; }
export interface StreakAPI {
  current(): StreakState;
  bump(day?: number): StreakState;
  display(day?: number): number;
}

export interface ShareCardRenderOpts {
  title?: string; n?: number | string; line?: string;
  motif?: string | HTMLImageElement | HTMLCanvasElement;
  url?: string; footer?: string;
  bg1?: string; bg2?: string; fg?: string; accent?: string;
}
export interface ShareCardShareOpts { url?: string; text?: string; title?: string; filename?: string; }
export interface ShareCardAPI {
  VARIANTS: string[];
  pickVariant(day?: number): string;
  variantLine(variant: string, ctx?: { line?: string; percentile?: number }): string;
  render(opts: ShareCardRenderOpts): Promise<Blob | null>;
  share(blob: Blob | null, opts?: ShareCardShareOpts): Promise<string>;
  share(opts: ShareCardShareOpts): Promise<string>;
}

export interface LoopTrackAPI {
  dailyStart(day?: number): void;
  dailySolve(r: { swipes?: number; par?: number }): void;
  cardShare(r: { variant?: string; channel?: string }): void;
  linkOpen(r: { ref?: string; variant?: string }): void;
  playFromLink(r: { ref?: string; variant?: string }): void;
}

export interface AnalyticsSink { ev(name: string, params?: Record<string, any>): void; }
export function configure(opts: { namespace?: string; track?: AnalyticsSink; epoch?: number | Date }): { namespace: string; epoch: number };

export const Daily: DailyAPI;
export const Streak: StreakAPI;
export const ShareCard: ShareCardAPI;
export const LoopTrack: LoopTrackAPI;
export const VERSION: string;
