import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo, useCallback } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { CodeBlock, CodeBlockCode } from "./code-block"

export type MarkdownLinkHandler = {
  onThreadClick?: (threadId: string) => void
  onPageClick?: (pagePath: string) => void  // Page path like "home.md" or "agents/index.md"
}

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
  linkHandlers?: MarkdownLinkHandler
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const text = markdown.replace(/\n\n/g, '\n\n&nbsp;\n\n')
  const tokens = marked.lexer(text)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : "plaintext"
}

// Create base components (without link handling)
function createBaseComponents(): Partial<Components> {
  return {
    code: function CodeComponent({ className, children, ...props }) {
      const isInline =
        !props.node?.position?.start.line ||
        props.node?.position?.start.line === props.node?.position?.end.line

      if (isInline) {
        return (
          <span
            className={cn(
              "bg-primary-foreground rounded-sm px-1 font-mono text-sm",
              className
            )}
            {...props}
          >
            {children}
          </span>
        )
      }

      const language = extractLanguage(className)

      return (
        <CodeBlock className={className}>
          <CodeBlockCode code={children as string} language={language} />
        </CodeBlock>
      )
    },
    pre: function PreComponent({ children }) {
      return <>{children}</>
    },
  }
}

// Create components with custom link handlers
function createComponentsWithLinkHandlers(
  linkHandlers?: MarkdownLinkHandler
): Partial<Components> {
  const baseComponents = createBaseComponents()

  if (!linkHandlers) {
    return baseComponents
  }

  return {
    ...baseComponents,
    a: function LinkComponent({ href, children, ...props }) {
      // Handle thread: protocol
      if (href?.startsWith('thread:')) {
        const threadId = href.slice(7) // Remove 'thread:' prefix
        return (
          <span
            role="button"
            tabIndex={0}
            className="text-blue-500 hover:text-blue-600 underline cursor-pointer font-medium"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              linkHandlers.onThreadClick?.(threadId)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                linkHandlers.onThreadClick?.(threadId)
              }
            }}
          >
            {children}
          </span>
        )
      }

      // Handle page: protocol
      if (href?.startsWith('page:')) {
        const pagePath = decodeURIComponent(href.slice(5)) // Remove 'page:' prefix
        return (
          <span
            role="button"
            tabIndex={0}
            className="text-primary hover:text-primary/80 underline cursor-pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              linkHandlers.onPageClick?.(pagePath)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                linkHandlers.onPageClick?.(pagePath)
              }
            }}
          >
            {children}
          </span>
        )
      }

      // Regular links - open in new tab
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 underline"
          {...props}
        >
          {children}
        </a>
      )
    },
  }
}

const INITIAL_COMPONENTS = createBaseComponents()

// Custom URL transform to allow thread: and page: protocols
function customUrlTransform(url: string): string {
  // Allow our custom protocols
  if (url.startsWith('thread:') || url.startsWith('page:')) {
    return url
  }
  // For other URLs, use default behavior (allows http, https, mailto, etc.)
  // Return the URL as-is for standard protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:']
  try {
    const parsed = new URL(url, 'http://example.com')
    if (safeProtocols.some(p => parsed.protocol === p)) {
      return url
    }
  } catch {
    // Relative URL or invalid, allow it
    return url
  }
  return url
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
        urlTransform={customUrlTransform}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content && prevProps.components === nextProps.components
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components,
  linkHandlers,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  // Memoize components with link handlers
  const mergedComponents = useMemo(() => {
    const baseWithLinks = createComponentsWithLinkHandlers(linkHandlers)
    return components ? { ...baseWithLinks, ...components } : baseWithLinks
  }, [linkHandlers, components])

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={mergedComponents}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
