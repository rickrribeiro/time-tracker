import { StudyFlashcard } from '../../types'
import { localDateStr } from '../../utils/dates'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export interface SrsUpdate {
  easeFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: string // YYYY-MM-DD
  lastReviewedAt: string // ISO
}

/** Add N days to a YYYY-MM-DD date, returning YYYY-MM-DD (local). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

// Map the 4 review buttons to SM-2 quality q ∈ [0..5].
// again = lapse (q<3); hard/good/easy = pass with rising quality.
const QUALITY: Record<Rating, number> = { again: 2, hard: 3, good: 4, easy: 5 }
const MIN_EASE = 1.3

/**
 * SM-2 (SuperMemo 2 / Anki-style) scheduler.
 * - Ease update (canonical): EF' = EF + (0.1 − (5−q)·(0.08 + (5−q)·0.02)), floored at 1.3.
 * - Interval progression on a pass: 1st = 1 day, 2nd = 6 days, then round(interval·EF').
 * - A lapse (q < 3) resets repetitions to 0 and interval to 0 (due today) but KEEPS the ease
 *   (SM-2 only nudges EF via the formula; it does not extra-penalise on lapse).
 * - "hard"/"easy" apply small multipliers on top (Anki-like), still SM-2 at the core.
 */
export function schedule(card: Pick<StudyFlashcard, 'easeFactor' | 'intervalDays' | 'repetitions'>, rating: Rating): SrsUpdate {
  const today = localDateStr(new Date())
  const q = QUALITY[rating]
  let ease = card.easeFactor || 2.5
  let reps = card.repetitions || 0
  let interval = card.intervalDays || 0

  // canonical SM-2 ease update from quality
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  if (ease < MIN_EASE) ease = MIN_EASE

  if (q < 3) {
    // lapse → relearn from the start (ease preserved)
    reps = 0
    interval = 0
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(interval * ease)
    // rating nuance on the multiplier (kept mild)
    if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.8))
    else if (rating === 'easy') interval = Math.round(interval * 1.3)
    interval = Math.max(1, interval)
  }

  return {
    easeFactor: Math.round(ease * 100) / 100,
    intervalDays: interval,
    repetitions: reps,
    nextReviewAt: addDays(today, interval),
    lastReviewedAt: new Date().toISOString()
  }
}
