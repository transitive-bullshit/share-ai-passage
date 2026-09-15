export type CardTextFit = {
  scale: number
  lower: number
  upper: number
  attempt: number
  done: boolean
}

export function initialCardTextFit(): CardTextFit {
  return { scale: 1, lower: 0, upper: 1, attempt: 0, done: false }
}

/** Both layout engines search for the largest fitting size in eight measurements. */
export function nextCardTextFit(fit: CardTextFit, fits: boolean): CardTextFit {
  const lower = fits ? fit.scale : fit.lower
  const upper = fits ? fit.upper : fit.scale
  const attempt = fit.attempt + 1
  const done = (fits && fit.scale === 1) || attempt === 8
  if (done && lower === 0)
    throw new Error('Social card text could not fit within its template')
  return {
    scale: done ? lower : (lower + upper) / 2,
    lower,
    upper,
    attempt,
    done
  }
}

/** Highlight size on the 1200×630 card, shared by browser and native new-work checks. */
export const minimumCardBodySize = 22
export const cardTextReadabilityMessage =
  'Shorten the highlights or choose another style so the card stays readable.'

export function cardTextIsReadable(scale: number, bodySize: number) {
  return scale * bodySize >= minimumCardBodySize
}
