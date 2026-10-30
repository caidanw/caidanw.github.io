import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { SITE_DESCRIPTION, SITE_TITLE } from '@/consts'

interface Post {
  frontmatter: {
    title: string
    date: string
    description?: string
    draft?: boolean
  }
  url: string
}

export function GET(context: APIContext) {
  // Mirrors the blog index: `_`-prefixed files are drafts, and `draft: true` is never published.
  const posts = Object.values(import.meta.glob<Post>(['./blog/*.md', '!./blog/_*.md'], { eager: true }))
    .filter((post) => !post.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime())

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.frontmatter.title,
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description,
      link: post.url,
    })),
  })
}
