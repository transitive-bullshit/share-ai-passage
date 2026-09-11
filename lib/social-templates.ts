/** Repository-owned social-card designs. Paths are local public assets, never remote URLs. */
export const socialTemplateIds = [
  'margin-notes',
  'electric-risograph',
  'makers-workbench',
  'midnight-observatory',
  'friendly-lab'
] as const

export type SocialTemplateId = (typeof socialTemplateIds)[number]
export const DEFAULT_SOCIAL_TEMPLATE_ID: SocialTemplateId = 'margin-notes'

export type SocialTemplateFont = {
  family: 'Inter' | 'DM Sans' | 'Newsreader'
  weight: 400 | 500 | 700
  /** Prepared from the installed Fontsource package; included in the server deployment. */
  file: string
}

export type SocialTemplate = {
  id: SocialTemplateId
  name: string
  description: string
  version: 1
  backgroundImage: string
  font: { title: SocialTemplateFont; body: SocialTemplateFont }
  layout: {
    copy: { left: number; top: number; width: number; maxHeight: number }
    titleSize: number
    titleLineHeight: number
    titleLetterSpacing: number
    highlightSize: number
    highlightLineHeight: number
    gap: number
    highlightGap: number
    headerTop: number
    footerTop: number
    footerWidth: number
    scrim: string
    marker: 'dash' | 'square' | 'number' | 'star' | 'circle'
  }
  colors: {
    background: string
    text: string
    muted: string
    accent: string
    rule: string
  }
}

const inter = (weight: 400 | 500 | 700): SocialTemplateFont => ({
  family: 'Inter',
  weight,
  file: `inter-latin-${weight}-normal.woff`
})
const dmSans = (weight: 400 | 500 | 700): SocialTemplateFont => ({
  family: 'DM Sans',
  weight,
  file: `dm-sans-latin-${weight}-normal.woff`
})
const newsreader: SocialTemplateFont = {
  family: 'Newsreader',
  weight: 400,
  file: 'newsreader-latin-400-normal.woff'
}

export const socialTemplates: readonly SocialTemplate[] = [
  {
    id: 'margin-notes',
    name: 'Margin notes',
    description:
      'Warm paper, thoughtful ink, and a playful illustrated margin.',
    version: 1,
    backgroundImage: '/social-templates/margin-notes/background.jpg',
    font: { title: newsreader, body: inter(400) },
    layout: {
      copy: { left: 66, top: 134, width: 710, maxHeight: 396 },
      titleSize: 68,
      titleLineHeight: 1.04,
      titleLetterSpacing: -1.5,
      highlightSize: 27,
      highlightLineHeight: 1.35,
      gap: 29,
      highlightGap: 14,
      headerTop: 49,
      footerTop: 558,
      footerWidth: 710,
      scrim:
        'linear-gradient(90deg, #f8f4e9 0%, rgba(248,244,233,0.99) 50%, rgba(248,244,233,0.94) 62%, rgba(248,244,233,0) 79%)',
      marker: 'dash'
    },
    colors: {
      background: '#f8f4e9',
      text: '#282923',
      muted: '#54554a',
      accent: '#c44b35',
      rule: '#d9d1bc'
    }
  },
  {
    id: 'electric-risograph',
    name: 'Electric risograph',
    description: 'Cobalt type, coral geometry, and the grain of a bold print.',
    version: 1,
    backgroundImage: '/social-templates/electric-risograph/background.jpg',
    font: { title: dmSans(700), body: inter(400) },
    layout: {
      copy: { left: 62, top: 138, width: 684, maxHeight: 392 },
      titleSize: 61,
      titleLineHeight: 1.04,
      titleLetterSpacing: -2.4,
      highlightSize: 26,
      highlightLineHeight: 1.34,
      gap: 29,
      highlightGap: 14,
      headerTop: 48,
      footerTop: 558,
      footerWidth: 684,
      scrim:
        'linear-gradient(90deg, rgba(252,229,213,0.99) 0%, rgba(252,229,213,0.98) 51%, rgba(252,229,213,0.86) 62%, rgba(252,229,213,0) 76%)',
      marker: 'square'
    },
    colors: {
      background: '#fce5d5',
      text: '#173a9d',
      muted: '#2b417a',
      accent: '#d84930',
      rule: '#dda99a'
    }
  },
  {
    id: 'makers-workbench',
    name: 'Maker’s workbench',
    description:
      'Tactile paper, bright materials, and a little handmade curiosity.',
    version: 1,
    backgroundImage: '/social-templates/makers-workbench/background.jpg',
    font: { title: dmSans(500), body: dmSans(400) },
    layout: {
      copy: { left: 72, top: 143, width: 681, maxHeight: 387 },
      titleSize: 62,
      titleLineHeight: 1.07,
      titleLetterSpacing: -1.9,
      highlightSize: 27,
      highlightLineHeight: 1.35,
      gap: 27,
      highlightGap: 14,
      headerTop: 52,
      footerTop: 558,
      footerWidth: 681,
      scrim:
        'linear-gradient(90deg, rgba(250,247,239,0.98) 0%, rgba(250,247,239,0.96) 51%, rgba(250,247,239,0.85) 63%, rgba(250,247,239,0) 79%)',
      marker: 'number'
    },
    colors: {
      background: '#faf7ef',
      text: '#30342e',
      muted: '#53594f',
      accent: '#ad492d',
      rule: '#d9d6c8'
    }
  },
  {
    id: 'midnight-observatory',
    name: 'Midnight observatory',
    description: 'Cream serif type and copper glints in a quiet night sky.',
    version: 1,
    backgroundImage: '/social-templates/midnight-observatory/background.jpg',
    font: { title: newsreader, body: inter(400) },
    layout: {
      copy: { left: 65, top: 138, width: 700, maxHeight: 392 },
      titleSize: 69,
      titleLineHeight: 1.04,
      titleLetterSpacing: -1.4,
      highlightSize: 26,
      highlightLineHeight: 1.4,
      gap: 29,
      highlightGap: 14,
      headerTop: 49,
      footerTop: 558,
      footerWidth: 700,
      scrim:
        'linear-gradient(90deg, #101f2b 0%, rgba(16,31,43,0.99) 51%, rgba(16,31,43,0.92) 64%, rgba(16,31,43,0) 91%)',
      marker: 'star'
    },
    colors: {
      background: '#101f2b',
      text: '#f7efdc',
      muted: '#d0d4ce',
      accent: '#d8ad72',
      rule: '#42525b'
    }
  },
  {
    id: 'friendly-lab',
    name: 'Friendly lab',
    description:
      'An ink creature, a small experiment, and room for a big idea.',
    version: 1,
    backgroundImage: '/social-templates/friendly-lab/background.jpg',
    font: { title: dmSans(700), body: dmSans(400) },
    layout: {
      copy: { left: 65, top: 138, width: 714, maxHeight: 392 },
      titleSize: 62,
      titleLineHeight: 1.07,
      titleLetterSpacing: -1.8,
      highlightSize: 27,
      highlightLineHeight: 1.35,
      gap: 29,
      highlightGap: 14,
      headerTop: 49,
      footerTop: 558,
      footerWidth: 714,
      scrim:
        'linear-gradient(90deg, rgba(252,251,246,0.98) 0%, rgba(252,251,246,0.96) 50%, rgba(252,251,246,0.78) 64%, rgba(252,251,246,0) 78%)',
      marker: 'circle'
    },
    colors: {
      background: '#fcfbf6',
      text: '#202d34',
      muted: '#4e5b60',
      accent: '#c74837',
      rule: '#cfd9d8'
    }
  }
]

export function getSocialTemplate(id: SocialTemplateId): SocialTemplate {
  return socialTemplates.find((template) => template.id === id)!
}
