import { describe, it, expect } from 'vitest'
import { formatInlineMarkdown } from './markdown'

describe('formatInlineMarkdown', () => {
  it('converts bold text', () => {
    const result = formatInlineMarkdown('This is **bold** text')
    expect(result).toContain('<strong')
    expect(result).toContain('bold')
  })

  it('converts italic text', () => {
    const result = formatInlineMarkdown('This is *italic* text')
    expect(result).toContain('<em')
    expect(result).toContain('italic')
  })

  it('converts inline code', () => {
    const result = formatInlineMarkdown('Use `code` here')
    expect(result).toContain('<code')
    expect(result).toContain('code')
  })

  it('converts links', () => {
    const result = formatInlineMarkdown('Click [here](https://example.com)')
    expect(result).toContain('<a href="https://example.com"')
    expect(result).toContain('here')
  })

  it('handles multiple formats in one line', () => {
    const result = formatInlineMarkdown('**Bold** and *italic* and `code`')
    expect(result).toContain('<strong')
    expect(result).toContain('<em')
    expect(result).toContain('<code')
  })

  it('returns plain text unchanged', () => {
    const result = formatInlineMarkdown('Plain text without formatting')
    expect(result).toBe('Plain text without formatting')
  })
})
