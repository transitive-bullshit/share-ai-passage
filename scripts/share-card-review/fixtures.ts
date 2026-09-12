import type {
  ExtractedConversation,
  GeneratedPreview,
  Message,
  Provider
} from '../../lib/domain'

export type ReviewFixture = {
  id: string
  label: string
  topic: string
  source: ExtractedConversation
  preview: GeneratedPreview
  provider: Provider
  reviewNotes: string
}

type Turn = [role: Message['role'], ...parts: string[]]

/** Authored examples, with provider values used only to exercise card branding. */
function conversation(
  id: string,
  title: string,
  turns: Turn[]
): ExtractedConversation {
  return {
    title,
    parserVersion: 'authored-share-card-review-v1',
    messages: turns.map(([role, ...parts], index) => ({
      id: `${id}-${index + 1}`,
      type: 'message',
      role,
      content: parts.map((text) => ({
        type: role === 'assistant' ? 'output_text' : 'input_text',
        text
      }))
    }))
  }
}

const longReviewAreas = [
  'the search field',
  'the filter menu',
  'the results list',
  'the saved views panel',
  'the empty state',
  'the loading state',
  'the error message',
  'the export dialog',
  'the account menu',
  'the keyboard shortcuts',
  'the help panel',
  'the activity list',
  'the project switcher',
  'the notification settings'
]

const longReviewTurns: Turn[] = [
  [
    'user',
    'Help us review the accessibility of our document search prototype. We have one week and two engineers. Decide what belongs in the first release, what should wait, and how we will know the release is ready. A full visual redesign is out of scope. We must keep keyboard access and readable error messages.'
  ],
  [
    'assistant',
    'Let’s record each finding before choosing a release plan. We can test the prototype with keyboard navigation, a screen reader, and enlarged text. Treat the findings as observations about this prototype; they are not proof that every user will have the same experience.'
  ],
  ...Array.from({ length: 42 }, (_, index): Turn[] => {
    const area = longReviewAreas[index % longReviewAreas.length]!
    const pass = Math.floor(index / longReviewAreas.length) + 1
    return [
      [
        'user',
        `Review note ${index + 1}, pass ${pass}, ${area}: the current prototype lets me reach the control with a keyboard, but I sometimes lose track of focus after opening an overlay and returning to the page. The visible label is clear when the page is wide. At a narrow width, the surrounding helper text wraps and makes the next action harder to find. I have only tried one browser so far. This is a local observation, not a completed fix or a complete accessibility audit. Please keep it in the working notes while we review the remaining areas.`,
        'The designer would also like to change the color palette, replace the icons, and add animated transitions. Those ideas are optional. We should not spend the release week on decoration while basic interaction issues are still unresolved.'
      ],
      [
        'assistant',
        `For ${area}, record focus restoration and narrow-layout readability as checks to reproduce. A proposed fix is to return focus to the control that opened the overlay and keep essential instructions next to the relevant action. No implementation or verification has happened yet. Test with keyboard-only input, then confirm that a screen reader announces the control and its current state. Capture a short result for each check so the final release decision can distinguish verified work from suggestions.`,
        `Pass ${pass} remains exploratory. Do not call this area fixed merely because the suggested approach sounds reasonable. Defer the palette, icon, and animation ideas unless one directly prevents a user from completing the task. We will choose the final scope after reviewing all observations.`
      ]
    ]
  }).flat(),
  [
    'user',
    'Final update: we fixed focus restoration, added visible focus indicators, and rewrote the error messages. Keyboard and screen-reader checks passed for search, filters, and export in the two browsers we support. We have not tested every panel. Please close the review with a release decision based on this update. We will keep the visual redesign and the remaining panel checks on the backlog.'
  ],
  [
    'assistant',
    'Release the search, filter, and export fixes after the existing regression checks pass. Focus restoration, visible focus indicators, and clearer error messages are implemented; the supported keyboard and screen-reader checks passed for those three flows. This is a scoped release, not a claim that the whole product is accessible. Keep the visual redesign and the untested panels on the backlog, with a named owner and a follow-up review.'
  ]
]

export const reviewFixtures: ReviewFixture[] = [
  {
    id: 'tiny-everyday',
    label: 'Tiny everyday question',
    topic: 'Home · 2 short turns · 1 highlight',
    provider: 'chatgpt',
    reviewNotes:
      'One useful takeaway is enough. Watch for padding, invented steps, or a second takeaway that repeats the first.',
    source: conversation('tiny-everyday', 'Saving the rest of a loaf', [
      [
        'user',
        'I only need two slices of bread today. How should I save the rest?'
      ],
      [
        'assistant',
        'Slice the rest and freeze it. Then take out only the slices you need.'
      ]
    ]),
    preview: {
      title: 'Freeze bread in slices',
      highlights: ['Take out only what you need.']
    }
  },
  {
    id: 'debugging-retry',
    label: 'Debugging with a partial fix',
    topic: 'Programming · 8 turns · proposed versus completed',
    provider: 'claude',
    reviewNotes:
      'Preserve the difference between the verified duplicate-click fix and the retry design that has only been proposed.',
    source: conversation('debugging-retry', 'Why does Save create two notes?', [
      [
        'user',
        'Our notes app sometimes creates two copies when Save is clicked twice. The request is a POST to /notes. We disable the button after awaiting the response.'
      ],
      [
        'assistant',
        'The button stays active while the first request is pending. Set the pending state before starting the request and clear it in finally.',
        '```ts\nif (pending) return\nsetPending(true)\ntry {\n  await createNote(input)\n} finally {\n  setPending(false)\n}\n```'
      ],
      [
        'user',
        'We also need network retries. Would disabling the button prevent duplicates if a response gets lost?'
      ],
      [
        'assistant',
        'No. The server might save a note even if the client never receives the response. A retry can create another note. A proposed server-side approach is to accept an idempotency key for a create operation and return the first result when that key is reused.'
      ],
      [
        'user',
        'I moved the pending state before the request. The double-click check now creates one note. I have not changed the server.'
      ],
      [
        'assistant',
        'That verifies the duplicate-click fix. The retry case is still open. Keep retries off until the server can recognize repeated attempts at the same operation.'
      ],
      ['user', 'Summarize what is done and what we should do next.'],
      [
        'assistant',
        'Done: the Save button becomes pending before the request, and your double-click check creates one note. Next: design and test server-side idempotency before adding automatic retries. That server change has not been implemented or verified.'
      ]
    ]),
    preview: {
      title: 'Stop duplicate saves, then make retries safe',
      highlights: [
        'The pending-state fix passed the double-click check.',
        'Server-side idempotency is proposed; retries remain off.'
      ]
    }
  },
  {
    id: 'weekend-plan',
    label: 'A relaxed weekend plan',
    topic: 'Travel planning · 6 turns · preferences and open bookings',
    provider: 'chatgpt',
    reviewNotes:
      'Keep the chosen pace and rain fallback. Do not present a suggested itinerary as reservations or completed travel.',
    source: conversation('weekend-plan', 'A quiet city weekend', [
      [
        'user',
        'We are planning a two-day city break. We arrive Friday evening and leave Sunday at 5 pm. We want one museum, good food, and time to wander. No packed schedule, and no rental car.'
      ],
      [
        'assistant',
        'Keep Friday to dinner near your hotel. Make the museum the only timed activity on Saturday, then leave the afternoon for a walk and a café. On Sunday, choose a market or a park near your departure route.'
      ],
      ['user', 'There may be rain. We also prefer a late breakfast.'],
      [
        'assistant',
        'Start Saturday after breakfast. If it rains, swap the afternoon walk for an indoor market or a second café. Leave Sunday afternoon open so you can collect your bags and reach the station without rushing.'
      ],
      [
        'user',
        'That pace works. Nothing is booked yet; we will choose the museum next.'
      ],
      [
        'assistant',
        'The plan is one main activity each day, with a late start on Saturday and a rain fallback indoors. Next, choose the museum and check its entry times. Keep Sunday afternoon free for the trip home.'
      ]
    ]),
    preview: {
      title: 'A city weekend with room to wander',
      highlights: [
        'Plan one main activity each day and a late Saturday start.',
        'Use an indoor rain fallback; keep Sunday afternoon free.',
        'Choose the museum next. Nothing is booked yet.'
      ]
    }
  },
  {
    id: 'product-tradeoff',
    label: 'A product tradeoff',
    topic: 'Product strategy · 6 turns · a decision with a constraint',
    provider: 'claude',
    reviewNotes:
      'Capture the actual first-release decision and its reason. Avoid claiming that sync was rejected forever.',
    source: conversation(
      'product-tradeoff',
      'Offline notes or account sync first?',
      [
        [
          'user',
          'We are building a notes app for field researchers. We can ship offline capture or account sync this month, but not both. Which should come first?'
        ],
        [
          'assistant',
          'Which failure is more costly for the first users: losing access to capture in the field, or moving notes between devices by hand?'
        ],
        [
          'user',
          'The pilot is six researchers who mostly use one laptop each. Connectivity is unreliable at their sites. They can export files at the end of the day.'
        ],
        [
          'assistant',
          'Prioritize offline capture with a clear saved state and file export. That supports the pilot’s core task without adding accounts, synchronization conflicts, or recovery flows. Track requests for multi-device work during the pilot.'
        ],
        [
          'user',
          'Agreed. First release is local capture and export. We will revisit sync after the pilot, using actual requests rather than guessing.'
        ],
        [
          'assistant',
          'Decision: ship offline capture and export first. The pilot uses one laptop per researcher and needs reliable capture without connectivity. Account sync is deferred until pilot feedback shows whether multi-device access is worth the extra work.'
        ]
      ]
    ),
    preview: {
      title: 'Ship offline notes before account sync',
      highlights: [
        'The pilot needs reliable capture on one laptop.',
        'Ship local saving and export; revisit sync after feedback.'
      ]
    }
  },
  {
    id: 'science-uncertainty',
    label: 'An uncertain experiment',
    topic: 'Science · 6 turns · small sample and competing explanations',
    provider: 'chatgpt',
    reviewNotes:
      'Retain uncertainty. A small uncontrolled observation must not become proof that the lamp caused faster growth.',
    source: conversation(
      'science-uncertainty',
      'Did the desk lamp help the seedlings?',
      [
        [
          'user',
          'I put four bean seedlings under a desk lamp and four on a windowsill. After a week, the lamp group was taller. Does that prove the lamp works better?'
        ],
        [
          'assistant',
          'It is an observation, not proof. With only four plants per group, chance differences can matter. The groups may also differ in temperature, watering, or how much light they receive. Height alone does not capture every aspect of plant health.'
        ],
        [
          'user',
          'The windowsill was cooler, and I did not measure the starting heights.'
        ],
        [
          'assistant',
          'Those differences make the cause unclear. In another trial, record starting size, assign similar seedlings to groups at random, and keep watering, soil, and temperature as similar as you can. Measure change over time rather than comparing final height alone.'
        ],
        [
          'user',
          'So I should say the lamp group grew taller in this trial, but we do not know why?'
        ],
        [
          'assistant',
          'Yes. That describes what you observed without claiming a cause. A more controlled repeat could help test whether the light setup accounts for the difference.'
        ]
      ]
    ),
    preview: {
      title: 'Taller seedlings do not prove the lamp helped',
      highlights: [
        'Eight plants and different conditions leave the cause unclear.',
        'Repeat with starting measurements and more consistent conditions.'
      ]
    }
  },
  {
    id: 'german-workshop',
    label: 'A German workshop plan',
    topic: 'German · 4 turns · accents, wrapping, and language choice',
    provider: 'claude',
    reviewNotes:
      'Check German umlauts and line breaks. Keep the summary in the conversation’s language and avoid unnecessary English.',
    source: conversation(
      'german-workshop',
      'Fahrradwerkstatt im Nachbarschaftshaus',
      [
        [
          'user',
          'Wir möchten am Samstag eine kleine Fahrradwerkstatt im Nachbarschaftshaus anbieten. Zwei Helfer sind dabei, und wir haben drei Stunden. Wie halten wir die Planung einfach?'
        ],
        [
          'assistant',
          'Begrenzt das Angebot auf einfache Arbeiten, zum Beispiel Reifen aufpumpen und Schläuche wechseln. Bittet um Anmeldung mit einer kurzen Beschreibung des Problems. Plant feste Zeitfenster und etwas Puffer ein.'
        ],
        [
          'user',
          'Gut. Wir nehmen sechs Anmeldungen an und prüfen vorher, welche Ersatzteile nötig sind. Arbeiten an Bremsen überlassen wir einer Fachwerkstatt.'
        ],
        [
          'assistant',
          'Der Plan: sechs feste Termine in drei Stunden, mit Puffer zwischen den Arbeiten. Fragt vorab nach dem Problem und passenden Ersatzteilen. Beschränkt euch auf Reifen und Schläuche; Bremsen bleiben Sache der Fachwerkstatt.'
        ]
      ]
    ),
    preview: {
      title: 'Eine kleine Fahrradwerkstatt gut planen',
      highlights: [
        'Sechs Termine in drei Stunden, mit etwas Puffer.',
        'Probleme und nötige Ersatzteile vorab klären.',
        'Nur Reifen und Schläuche; Bremsen gehen an die Fachwerkstatt.'
      ]
    }
  },
  {
    id: 'dense-layout',
    label: 'Dense preview near the character limits',
    topic: 'Engineering planning · 4 turns · deliberate layout stress',
    provider: 'chatgpt',
    reviewNotes:
      'This authored preview is deliberately dense. Inspect wrapping and clipping in its sampled template; it is not a target for concise copy.',
    source: conversation(
      'dense-layout',
      'Planning a controlled document-search migration',
      [
        [
          'user',
          'We need to move document search to a new index. We have customer-specific access rules, saved searches, and old bookmarks. How can we migrate without switching everyone at once?'
        ],
        [
          'assistant',
          'Start with an internal workspace and compare old and new results. Verify access rules, saved searches, and bookmark routing before expanding. Keep a rollback option and define who can pause the rollout. Assign owners to the remaining checks so unclear responsibility does not become a release blocker.'
        ],
        [
          'user',
          'We will use the internal workspace first. The support lead can pause expansion, and the current index stays available for rollback. We still need to test permissions, saved searches, and bookmark redirects. Each check will get an owner and a review date.'
        ],
        [
          'assistant',
          'The rollout is planned, not complete. Begin with one internal workspace, keep the old index available, and review the results before adding customers. Permissions, saved searches, and bookmark redirects still require testing. Give every open check a named owner and review date; the support lead can pause expansion.'
        ]
      ]
    ),
    preview: {
      title: 'A careful rollout plan for a new document search experience',
      highlights: [
        'Start with one internal workspace, compare search results, and keep an old index ready for rollback.',
        'Verify customer permissions, saved searches, and bookmark redirects before expanding to more teams.',
        'Assign every remaining check an owner and review date; let the support lead pause a staged rollout.'
      ]
    }
  },
  {
    id: 'long-review',
    label: 'A long review with a final resolution',
    topic: 'Accessibility · 88 turns · exceeds the summary input budget',
    provider: 'claude',
    reviewNotes:
      'Exercises input truncation. Preserve the first request and final scoped resolution; do not mistake repeated proposals for completed work or claim a full accessibility audit.',
    source: conversation(
      'long-review',
      'A week-long accessibility review of document search',
      longReviewTurns
    ),
    preview: {
      title: 'Release the checked accessibility fixes',
      highlights: [
        'Focus and error-message fixes passed checks in three core flows.',
        'Untested panels and the visual redesign remain on the backlog.',
        'This release does not establish accessibility across the whole product.'
      ]
    }
  }
]
