import { describe, it, expect } from 'vitest'
import { markdownToProseMirror, prosemirrorToMarkdown } from './conversion'

describe('markdownToProseMirror', () => {
  it('parses list items with inline code correctly', () => {
    const markdown = '- **Markdown** (`.md`) — Text, docs, notes'
    const doc = markdownToProseMirror(markdown)

    // Convert back to markdown to verify round-trip
    const result = prosemirrorToMarkdown(doc)
    console.log('Input:', markdown)
    console.log('Output:', result)

    // Should contain all parts
    expect(result).toContain('Markdown')
    expect(result).toContain('.md')
    expect(result).toContain('Text, docs, notes')
  })

  it('parses simple inline code', () => {
    const markdown = 'Use `code` here'
    const doc = markdownToProseMirror(markdown)
    const result = prosemirrorToMarkdown(doc)
    console.log('Input:', markdown)
    console.log('Output:', result)
    expect(result).toContain('`code`')
  })
})
