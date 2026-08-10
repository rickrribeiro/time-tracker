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

/**
 * SM-2-lite: compute the next schedule for a card given a rating.
 * Fields (easeFactor/intervalDays/repetitions/nextReviewAt) are stored so a full
 * SM-2 later is a drop-in replacement of this function.
 */
export function schedule(card: Pick<StudyFlashcard, 'easeFactor' | 'intervalDays' | 'repetitions'>, rating: Rating): SrsUpdate {
  const today = localDateStr(new Date())
  let ease = card.easeFactor || 2.5
  let reps = card.repetitions || 0
  let interval = card.intervalDays || 0

  if (rating === 'again') {
    ease = Math.max(1.3, ease - 0.2)
    reps = 0
    interval = 0
  } else if (rating === 'hard') {
    ease = Math.max(1.3, ease - 0.15)
    interval = Math.max(1, Math.round((interval || 1) * 1.2))
    reps += 1
  } else if (rating === 'good') {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(1, Math.round(interval * ease))
    reps += 1
  } else {
    // easy
    ease = ease + 0.15
    interval = reps === 0 ? 2 : Math.max(1, Math.round(interval * ease * 1.3))
    reps += 1
  }

  return {
    easeFactor: Math.round(ease * 100) / 100,
    intervalDays: interval,
    repetitions: reps,
    nextReviewAt: addDays(today, interval),
    lastReviewedAt: new Date().toISOString()
  }
}
