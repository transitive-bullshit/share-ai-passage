import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { FontDetails } from 'takumi-js'

import type { SocialTemplateFont } from './social-templates'

type FontSubset = {
  name: string
  file: string
  weight?: 400 | 500 | 700
  ranges: [number, number][]
}
export type CardFont = FontDetails & {
  name: string
  subsetOf: string
  weight: number
  data: Buffer
  ranges: [number, number][]
}

const root = join(process.cwd(), 'assets/fonts')
const manifestPromise = readFile(join(root, 'manifest.json'), 'utf8').then(
  (text) => JSON.parse(text) as FontSubset[]
)
const fontData = new Map<string, Promise<Buffer>>()

export async function cardFonts(
  text: string,
  templateFonts?: readonly SocialTemplateFont[]
): Promise<CardFont[]> {
  const manifest = await manifestPromise
  const points = [
    ...new Set(Array.from(text, (character) => character.codePointAt(0)!))
  ]
  const covered = new Set<number>()
  const selected: FontSubset[] = []
  for (const subset of manifest) {
    const matches = points.filter((point) =>
      subset.ranges.some(([start, end]) => point >= start && point <= end)
    )
    const isPrimary =
      subset.name === 'Inter' ||
      subset.name === 'Newsreader' ||
      subset.name === 'DM Sans'
    if (isPrimary) {
      // Keep the original font set for legacy cards. New templates load only
      // their own faces plus Inter for the small shared brand and labels.
      const requested = templateFonts
        ? (subset.name === 'Inter' && (subset.weight ?? 400) <= 500) ||
          templateFonts.some(
            (font) =>
              font.family === subset.name && font.weight === subset.weight
          )
        : (subset.name === 'Inter' && (subset.weight ?? 400) <= 500) ||
          subset.weight === 400
      if (!requested) continue
    }
    if (matches.some((point) => isPrimary || !covered.has(point))) {
      selected.push(subset)
      for (const point of matches) covered.add(point)
    }
  }
  return Promise.all(
    selected.map(async (subset) => {
      let data = fontData.get(subset.file)
      if (!data) {
        data = readFile(join(root, subset.file))
        fontData.set(subset.file, data)
      }
      return {
        // Takumi expands the logical family across independently registered subsets.
        name: `${subset.name}-${subset.file}`,
        subsetOf: subset.name,
        subsetRank: manifest.indexOf(subset),
        ranges: subset.ranges,
        data: await data,
        weight: subset.weight ?? 400,
        style: 'normal' as const
      }
    })
  )
}
