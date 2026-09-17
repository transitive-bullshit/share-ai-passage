import type { ReviewCase, ReviewSnapshot } from './model'

const escape = (value: string | number) =>
  String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })

const artifactUrl = (snapshot: ReviewSnapshot, path: string) =>
  [snapshot.name, ...path.split('/')]
    .map((part) =>
      part === '.' || part === '..'
        ? part.replace(/\./g, '%2E')
        : encodeURIComponent(part)
    )
    .join('/')

const signed = (value: number) => (value > 0 ? `+${value}` : String(value))

const origin = (reviewCase: ReviewCase) =>
  reviewCase.summaryOrigin === 'generated'
    ? `AI generated${reviewCase.summaryModel ? ` · ${reviewCase.summaryModel}` : ''}`
    : 'Authored example · no AI generation'

const summaryChanged = (before: ReviewCase, after: ReviewCase) =>
  before.preview.title !== after.preview.title ||
  JSON.stringify(before.preview.highlights) !==
    JSON.stringify(after.preview.highlights)

function snapshotDetails(snapshot: ReviewSnapshot, label: string) {
  return `<section class="snapshot">
    <p class="eyebrow">${label}</p>
    <h2>${escape(snapshot.name)}</h2>
    <p class="muted"><time datetime="${escape(snapshot.createdAt)}">${escape(snapshot.createdAt)}</time></p>
    <p class="revision">Revision <code>${escape(snapshot.revision)}</code>${snapshot.dirty ? ' · uncommitted changes included' : ''}</p>
    <details class="provenance"><summary>Capture details</summary><dl>
      <dt>Summary task</dt><dd><code>${escape(snapshot.taskHash)}</code></dd>
      <dt>Card renderer</dt><dd><code>${escape(snapshot.rendererHash)}</code></dd>
      <dt>Conversation set</dt><dd><code>${escape(snapshot.corpusHash)}</code></dd>
    </dl></details>
  </section>`
}

function summaryDetails(reviewCase: ReviewCase, label: string) {
  return `<section class="summary-output">
    <p class="eyebrow">${label} · exact summary</p>
    <p class="origin">${escape(origin(reviewCase))}</p>
    <h4>${escape(reviewCase.preview.title)}</h4>
    <ul class="highlights">${reviewCase.preview.highlights.map((highlight) => `<li>${escape(highlight)}</li>`).join('')}</ul>
    <p class="muted">${reviewCase.metrics.titleWords} title words · ${reviewCase.metrics.highlightWords} highlight words · ${reviewCase.metrics.totalWords} total</p>
    ${reviewCase.summaryGeneratedAt ? `<p class="muted">Generated <time datetime="${escape(reviewCase.summaryGeneratedAt)}">${escape(reviewCase.summaryGeneratedAt)}</time></p>` : ''}
    ${reviewCase.summaryTaskHash ? `<p class="muted">Summary task <code>${escape(reviewCase.summaryTaskHash)}</code></p>` : ''}
    ${reviewCase.inputTruncated ? '<p class="notice">The summary task received a shortened transcript.</p>' : ''}
    ${reviewCase.reviewNotes ? `<div class="review-notes"><h5>Review notes</h5><p>${escape(reviewCase.reviewNotes)}</p></div>` : ''}
  </section>`
}

function transcript(reviewCase: ReviewCase) {
  return `<details class="transcript"><summary>Source conversation · ${reviewCase.source.messages.length} messages · ${reviewCase.metrics.sourceWords} words</summary>
    <h4>${escape(reviewCase.source.title)}</h4>
    ${reviewCase.source.messages
      .map(
        (
          message
        ) => `<section class="message"><p class="eyebrow">${escape(message.role)}${message.phase ? ` · ${escape(message.phase)}` : ''}</p>
      ${message.content
        .map((content) =>
          content.type === 'omitted'
            ? `<p class="omission">[${escape(content.kind)} omitted · ${escape(content.reason)}${content.count === undefined ? '' : ` · ${content.count} items`}]</p>`
            : content.type === 'image'
              ? '<p class="omission">[Saved image]</p>'
              : `<pre>${escape(content.text)}</pre>`
        )
        .join('')}</section>`
      )
      .join('')}
  </details>`
}

function cardFigure(
  snapshot: ReviewSnapshot,
  reviewCase: ReviewCase,
  card: ReviewCase['cards'][number] | undefined,
  label: string,
  templateName: string
) {
  if (!card) {
    return `<figure><figcaption><span class="eyebrow">${label}</span></figcaption><div class="missing-preview"><strong>${label === 'Baseline' ? 'Style added' : 'Style removed'}</strong><span>No card in this capture</span></div></figure>`
  }
  const imageUrl = escape(artifactUrl(snapshot, card.image))
  const htmlUrl = escape(artifactUrl(snapshot, card.html))
  const description = escape(`${label}: ${reviewCase.label}, ${templateName}`)
  return `<figure>
    <figcaption><span class="eyebrow">${label}</span><span class="origin">${escape(origin(reviewCase))}</span></figcaption>
    <a class="image-preview" href="${imageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open ${description} image at full size"><img src="${imageUrl}" alt="${description}" width="1200" height="630" loading="lazy" decoding="async"></a>
    <div class="html-preview" hidden><iframe data-preview="${htmlUrl}" title="${description} HTML preview" width="1200" height="630" loading="lazy" sandbox="" tabindex="-1"></iframe></div>
    <div class="artifact-links"><a href="${imageUrl}" target="_blank" rel="noopener noreferrer">Full-size image ↗</a><a href="${htmlUrl}" target="_blank" rel="noopener noreferrer">Saved HTML ↗</a></div>
  </figure>`
}

export function renderReviewReport(
  before: ReviewSnapshot,
  after?: ReviewSnapshot,
  run?: string
): string {
  const templates = new Map(
    [...before.templates, ...(after?.templates ?? [])].map((template) => [
      template.id,
      template.name
    ])
  )
  const candidates = new Map(
    after?.cases.map((reviewCase) => [reviewCase.id, reviewCase])
  )
  const totalCards = before.cases.reduce(
    (sum, reviewCase) =>
      sum +
      new Set(
        [
          ...reviewCase.cards,
          ...(candidates.get(reviewCase.id)?.cards ?? [])
        ].map((card) => card.templateId)
      ).size,
    0
  )
  const wordsBefore = before.cases.reduce(
    (sum, reviewCase) => sum + reviewCase.metrics.totalWords,
    0
  )
  const wordsAfter = after?.cases.reduce(
    (sum, reviewCase) => sum + reviewCase.metrics.totalWords,
    0
  )
  let changedCards = 0
  let changedSummaries = 0
  const sections = before.cases.map((reviewCase) => {
    const candidate = candidates.get(reviewCase.id)
    const textChanged = candidate
      ? summaryChanged(reviewCase, candidate)
      : false
    if (textChanged) changedSummaries++
    const templateIds = [
      ...new Set(
        [...reviewCase.cards, ...(candidate?.cards ?? [])].map(
          (card) => card.templateId
        )
      )
    ]
    const cards = templateIds.map((templateId) => {
      const card = reviewCase.cards.find(
        (item) => item.templateId === templateId
      )
      const candidateCard = candidate?.cards.find(
        (item) => item.templateId === templateId
      )
      const imageChanged = after
        ? card?.imageHash !== candidateCard?.imageHash
        : false
      const htmlChanged = after
        ? card?.htmlHash !== candidateCard?.htmlHash
        : false
      const changed = textChanged || imageChanged || htmlChanged
      if (changed) changedCards++
      const templateName = templates.get(templateId) ?? templateId
      const changes = [
        ...(textChanged ? ['Summary'] : []),
        ...(imageChanged ? ['image'] : []),
        ...(htmlChanged ? ['HTML'] : [])
      ]
      const changeLabel = !card
        ? 'Style added'
        : !candidateCard
          ? 'Style removed'
          : changes.length
            ? `${changes.join(' + ').replace(/^image/, 'Image')} changed`
            : 'Unchanged'
      return `<article class="card-review" data-template="${escape(templateId)}" data-changed="${changed}">
        <div class="card-heading"><h3>${escape(templateName)}</h3>${after ? `<span class="change-label${changed ? ' is-changed' : ''}">${changeLabel}</span>` : ''}</div>
        <div class="card-pair${after ? '' : ' single'}">${cardFigure(before, reviewCase, card, 'Baseline', templateName)}${after && candidate ? cardFigure(after, candidate, candidateCard, 'Candidate', templateName) : ''}</div>
      </article>`
    })
    return `<section class="case" data-case="${escape(reviewCase.id)}" data-topic="${escape(reviewCase.topic)}">
      <div class="case-heading"><div><p class="eyebrow">${escape(reviewCase.topic)} · ${escape(reviewCase.provider)} · ${reviewCase.metrics.sourceWords} source words</p><h2>${escape(reviewCase.label)}</h2></div>
      <div class="word-count"><strong>${reviewCase.metrics.totalWords}${candidate ? ` → ${candidate.metrics.totalWords}` : ''}</strong><span>summary words${candidate ? ` · ${signed(candidate.metrics.totalWords - reviewCase.metrics.totalWords)}` : ''}</span></div></div>
      <details class="case-details"><summary>Read summaries, review notes, and source</summary><div class="summary-pair${after ? '' : ' single'}">${summaryDetails(reviewCase, 'Baseline')}${candidate ? summaryDetails(candidate, 'Candidate') : ''}</div>${transcript(reviewCase)}</details>
      ${cards.join('')}
    </section>`
  })
  const topics = [
    ...new Set(before.cases.map((reviewCase) => reviewCase.topic))
  ].sort()
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Passage · Share card review</title>
<style>
  :root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f5f5f5; font-synthesis: none; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 14px; line-height: 1.55; }
  [hidden] { display: none !important; }
  a { color: inherit; text-underline-offset: 3px; }
  button, input, select { font: inherit; }
  button, select, input[type="checkbox"] { cursor: pointer; }
  :focus-visible { outline: 2px solid #171717; outline-offset: 4px; }
  h1, h2, h3, h4, h5, p { margin: 0; }
  h1 { font-size: clamp(30px, 4vw, 44px); font-weight: 500; letter-spacing: -.045em; line-height: 1.12; }
  h2 { font-size: 23px; font-weight: 500; letter-spacing: -.025em; line-height: 1.3; }
  h3 { font-size: 16px; font-weight: 500; }
  h4 { font-size: 19px; font-weight: 500; line-height: 1.4; }
  h5 { font-size: 13px; font-weight: 600; }
  .shell { max-width: 1664px; margin: 0 auto; padding: 0 32px; }
  header { background: #fff; border-bottom: 1px solid #e8e8e8; padding: 30px 0 32px; }
  .brand { font-size: 18px; font-weight: 600; letter-spacing: -.04em; margin-bottom: 30px; }
  .intro { max-width: 750px; color: #626262; margin-top: 14px; font-size: 16px; }
  .eyebrow { color: #737373; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
  .snapshots { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 36px; margin-top: 30px; padding-top: 24px; border-top: 1px solid #e8e8e8; }
  .snapshot h2 { margin: 5px 0 8px; font-size: 18px; overflow-wrap: anywhere; }
  .muted { color: #737373; font-size: 12px; }
  .revision { color: #626262; font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
  code { font-size: 11px; overflow-wrap: anywhere; }
  summary { cursor: pointer; font-size: 12px; font-weight: 500; }
  .provenance { margin-top: 10px; }
  dl { display: grid; grid-template-columns: 112px minmax(0,1fr); gap: 6px 12px; font-size: 12px; }
  dt { color: #737373; } dd { margin: 0; }
  .stats { display: flex; gap: 34px; flex-wrap: wrap; padding: 24px 0; }
  .stat strong { font-size: 23px; font-weight: 500; display: block; letter-spacing: -.03em; }
  .stat span { font-size: 12px; color: #737373; }
  .controls { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; padding: 18px 20px; background: #fff; border: 1px solid #e8e8e8; border-radius: 12px; }
  .control { display: grid; gap: 5px; }
  .control > span { font-size: 11px; color: #737373; }
  select { min-width: 150px; max-width: 300px; background: #fff; border: 1px solid #ddd; border-radius: 7px; padding: 8px 30px 8px 10px; color: #171717; }
  .check { display: flex; gap: 7px; align-items: center; min-height: 39px; font-size: 12px; }
  input { accent-color: #171717; }
  .disabled { color: #aaa; }
  .view-control { margin-left: auto; }
  .results { color: #737373; font-size: 12px; margin: 14px 0 28px; }
  .case { margin-bottom: 54px; }
  .case-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
  .case-heading h2 { margin-top: 6px; }
  .word-count { text-align: right; flex-shrink: 0; }
  .word-count strong { font-size: 22px; font-weight: 500; display: block; letter-spacing: -.03em; }
  .word-count span { color: #737373; font-size: 11px; }
  .case-details { border: 1px solid #e1e1e1; border-radius: 10px; margin-bottom: 20px; background: #fff; }
  .case-details > summary { padding: 13px 18px; }
  .summary-pair, .card-pair { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20px; }
  .summary-pair { padding: 8px 20px 24px; gap: 36px; }
  .summary-output > .origin { margin: 6px 0 16px; }
  .summary-output .muted { margin-top: 8px; }
  .highlights { padding-left: 20px; margin: 12px 0; }
  .highlights li { margin: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .summary-output h4 { white-space: pre-wrap; overflow-wrap: anywhere; }
  .notice { color: #5f4930; background: #faf5ed; padding: 8px 12px; margin-top: 12px; border-radius: 6px; font-size: 12px; }
  .review-notes { padding-top: 14px; margin-top: 16px; border-top: 1px solid #e8e8e8; }
  .review-notes p { margin-top: 6px; color: #626262; white-space: pre-wrap; overflow-wrap: anywhere; }
  .transcript { border-top: 1px solid #e8e8e8; padding: 14px 20px 18px; }
  .transcript h4 { margin-top: 20px; }
  .message { border-top: 1px solid #eee; margin-top: 18px; padding-top: 18px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 13px; max-height: 450px; overflow-y: auto; margin: 10px 0 0; }
  .omission { color: #737373; font-style: italic; }
  .card-review { padding: 20px; background: #fff; border: 1px solid #e8e8e8; border-radius: 12px; margin-top: 16px; }
  .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .change-label { color: #737373; font-size: 11px; padding: 3px 8px; background: #f5f5f5; border-radius: 5px; }
  .change-label.is-changed { color: #171717; background: #eaeaea; }
  figure { min-width: 0; margin: 0; }
  figcaption { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .origin { color: #737373; font-size: 11px; overflow-wrap: anywhere; }
  figcaption .origin { text-align: right; }
  .image-preview { display: block; background: #f5f5f5; outline: 1px solid #e8e8e8; overflow: hidden; border-radius: 5px; }
  img { display: block; width: 100%; height: auto; }
  .html-preview { width: 100%; aspect-ratio: 1200 / 630; position: relative; overflow: hidden; border-radius: 5px; outline: 1px solid #e8e8e8; background: #f5f5f5; }
  .missing-preview { aspect-ratio: 1200 / 630; border: 1px dashed #ddd; border-radius: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #737373; }
  .missing-preview strong { color: #171717; font-size: 16px; font-weight: 500; }
  .missing-preview span { font-size: 12px; margin-top: 4px; }
  iframe { display: block; border: 0; position: absolute; left: 0; top: 0; transform-origin: top left; }
  .artifact-links { display: flex; gap: 16px; margin-top: 10px; font-size: 11px; color: #737373; }
  .single { grid-template-columns: minmax(0,1fr); max-width: 1000px; }
  .empty { padding: 50px 20px; text-align: center; border: 1px dashed #ddd; border-radius: 12px; margin-bottom: 40px; }
  .empty p { color: #737373; margin-top: 6px; }
  footer { border-top: 1px solid #e1e1e1; padding: 24px 0 40px; color: #737373; font-size: 12px; }
  @media (max-width: 850px) {
    .shell { padding: 0 18px; }
    .snapshots, .summary-pair, .card-pair { grid-template-columns: minmax(0,1fr); gap: 24px; }
    .view-control { margin-left: 0; }
    .card-review { padding: 14px; }
    .case-heading { align-items: start; }
    .word-count strong { font-size: 19px; }
    .word-count span { max-width: 100px; display: block; }
  }
  @media (max-width: 480px) {
    .controls { gap: 12px; padding: 14px; }
    .control { width: 100%; }
    select { max-width: none; width: 100%; }
    .case-heading { flex-direction: column; gap: 12px; }
    .word-count { text-align: left; }
    .word-count span { max-width: none; }
    .stats { gap: 20px; }
    figcaption { flex-direction: column; gap: 3px; }
    figcaption .origin { text-align: left; }
  }
  @media print { .controls, .artifact-links, .results { display: none; } .card-review { break-inside: avoid; } .shell { padding: 0; } }
</style></head><body>
<header><div class="shell"><p class="brand">Passage${run ? ` · ${escape(run)}` : ''}</p><h1>Share card review</h1><p class="intro">${run ? 'The baseline stays fixed. Each update replaces the candidate at this same link.' : after ? 'Compare the saved baseline with a candidate. Check wording and fit across this representative sample.' : 'A representative sample of conversations and card styles, saved for reviewing future changes.'}</p>
<div class="snapshots">${snapshotDetails(before, 'Frozen baseline')}${after ? snapshotDetails(after, 'Latest candidate') : `<section class="snapshot"><p class="eyebrow">Ready to compare</p><h2>Make your change, then update</h2><p class="muted">${run ? `Run <code>pnpm cards:review update ${escape(run)}</code>, then refresh this page.` : 'Keep this capture. Create a candidate after editing the summary task or card design, then compare them.'}</p></section>`}</div></div></header>
<main class="shell">
<div class="stats"><div class="stat"><strong>${before.cases.length}</strong><span>conversations</span></div><div class="stat"><strong>${templates.size}</strong><span>card styles</span></div><div class="stat"><strong>${totalCards}</strong><span>${after ? `comparisons · ${changedCards} changed` : 'representative cards'}</span></div><div class="stat"><strong>${wordsBefore}${wordsAfter === undefined ? '' : ` → ${wordsAfter}`}</strong><span>summary words${wordsAfter === undefined ? '' : ` · ${signed(wordsAfter - wordsBefore)} overall`}</span></div>${after ? `<div class="stat"><strong>${changedSummaries}</strong><span>summaries changed</span></div>` : ''}</div>
<form class="controls" onsubmit="return false" aria-label="Review filters">
  <label class="control"><span>Topic</span><select id="topic"><option value="">All topics</option>${topics.map((topic) => `<option value="${escape(topic)}">${escape(topic)}</option>`).join('')}</select></label>
  <label class="control"><span>Conversation</span><select id="conversation"><option value="">All conversations</option>${before.cases.map((reviewCase) => `<option value="${escape(reviewCase.id)}">${escape(reviewCase.label)}</option>`).join('')}</select></label>
  <label class="control"><span>Card style</span><select id="template"><option value="">All styles</option>${[...templates].map(([id, name]) => `<option value="${escape(id)}">${escape(name)}</option>`).join('')}</select></label>
  <label class="check${after ? '' : ' disabled'}"><input id="changed" type="checkbox"${after ? '' : ' disabled'}>Changed only</label>
  <label class="control view-control"><span>Preview</span><select id="preview"><option value="image">Exported images</option><option value="html">Saved HTML</option></select></label>
</form>
<p class="results" id="results" role="status" aria-live="polite">Showing ${totalCards} of ${totalCards} cards. Click an image to inspect it at full size.</p>
<div id="gallery">${sections.join('')}</div><div class="empty" id="empty" hidden><h2>No cards match these filters</h2><p>Choose another conversation or style, or turn off “Changed only”.</p></div>
</main><footer><div class="shell">The baseline preserves its saved summaries and images. Word counts and file changes help you compare; they do not rate quality. HTML previews may differ from exported images.</div></footer>
<script>
  (() => {
    const topic = document.getElementById('topic')
    const conversation = document.getElementById('conversation')
    const template = document.getElementById('template')
    const changed = document.getElementById('changed')
    const preview = document.getElementById('preview')
    const cases = [...document.querySelectorAll('.case')]
    const total = document.querySelectorAll('.card-review').length
    const scaleFrames = () => {
      document.querySelectorAll('.html-preview').forEach(container => {
        if (!container.hidden && container.clientWidth) container.querySelector('iframe').style.transform = 'scale(' + container.clientWidth / 1200 + ')'
      })
    }
    const update = () => {
      let visible = 0
      const showHtml = preview.value === 'html'
      cases.forEach(section => {
        const matches = (!topic.value || topic.value === section.dataset.topic) && (!conversation.value || conversation.value === section.dataset.case)
        let visibleInCase = 0
        section.querySelectorAll('.card-review').forEach(card => {
          const show = matches && (!template.value || template.value === card.dataset.template) && (!changed.checked || card.dataset.changed === 'true')
          card.hidden = !show
          if (show) visibleInCase++
          card.querySelectorAll('.image-preview').forEach(image => { image.hidden = showHtml })
          card.querySelectorAll('.html-preview').forEach(container => {
            container.hidden = !showHtml
            const frame = container.querySelector('iframe')
            if (show && showHtml && !frame.getAttribute('src')) frame.src = frame.dataset.preview
          })
        })
        section.hidden = visibleInCase === 0
        visible += visibleInCase
      })
      document.getElementById('empty').hidden = visible !== 0
      document.getElementById('results').textContent = 'Showing ' + visible + ' of ' + total + ' cards. ' + (showHtml ? 'Saved HTML previews use the captured markup.' : 'Click an image to inspect it at full size.')
      scaleFrames()
    }
    const controls = [topic, conversation, template, changed, preview]
    controls.forEach(control => control.addEventListener('change', update))
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scaleFrames)
      document.querySelectorAll('.html-preview').forEach(container => observer.observe(container))
    } else window.addEventListener('resize', scaleFrames)
    update()
  })()
</script></body></html>`
}
