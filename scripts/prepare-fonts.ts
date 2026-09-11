import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const target = join(process.cwd(), 'assets/fonts')
await mkdir(target, { recursive: true })

type FontSubset = {
  name: string
  file: string
  weight: 400 | 500 | 700
  ranges: [number, number][]
}
const manifest: FontSubset[] = []

for (const [packageName, name, weight] of [
  ['inter', 'Inter', 400],
  ['inter', 'Inter', 500],
  ['inter', 'Inter', 700],
  ['newsreader', 'Newsreader', 400],
  ['dm-sans', 'DM Sans', 400],
  ['dm-sans', 'DM Sans', 500],
  ['dm-sans', 'DM Sans', 700],
  ['noto-sans', 'Noto Sans', 400],
  ['noto-emoji', 'Noto Emoji', 400],
  ['noto-sans-sc', 'Noto Sans SC', 400]
] as const) {
  const directory = join(process.cwd(), 'node_modules/@fontsource', packageName)
  const css = await readFile(join(directory, `${weight}.css`), 'utf8')
  for (const block of css.split('@font-face')) {
    const file = /url\(\.\/files\/([^)]+\.woff)\)/u.exec(block)?.[1]
    const rangeText = /unicode-range:\s*([^;]+);/u.exec(block)?.[1]
    if (!file || !rangeText) continue
    const ranges: [number, number][] = rangeText.split(',').map((range) => {
      const [start, end] = range.trim().replace(/^U\+/iu, '').split('-')
      return [Number.parseInt(start!, 16), Number.parseInt(end || start!, 16)]
    })
    await copyFile(join(directory, 'files', file), join(target, file))
    manifest.push({ name, file, weight, ranges })
  }
  await copyFile(
    join(directory, 'LICENSE'),
    join(target, `${packageName}-LICENSE`)
  )
}

await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest))
console.log(`Prepared ${manifest.length} local font subsets for social cards.`)
