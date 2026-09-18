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
  return {
    scale: done ? lower || fit.scale : (lower + upper) / 2,
    lower,
    upper,
    attempt,
    done
  }
}
