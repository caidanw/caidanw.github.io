---
layout: src/layouts/BlogPost.astro
title: Markdown Test Post
date: '2026-01-03T12:00:00-08:00'
description: A comprehensive test file for previewing blog post styling
draft: true
---

This is a test blog post to preview how various markdown elements render. Use this to verify styling and layout.

## Text Formatting

Regular paragraph text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

**Bold text**, _italic text_, and **_bold italic text_**. Also ~~strikethrough~~.

## Headers

The headers below demonstrate h3 through h6 (h1 is the title, h2 is used for sections):

### Header 3

#### Header 4

##### Header 5

###### Header 6

## Lists

### Unordered List

- First item
- Second item
- Third item
  - Nested item
  - Another nested item
- Fourth item

### Ordered List

1. First step
2. Second step
3. Third step
   1. Sub-step A
   2. Sub-step B
4. Fourth step

### Task List

- [ ] Incomplete task
- [x] Completed task
- [ ] Another incomplete task

## Links and Images

Here's a [link to GitHub](https://github.com).

![Placeholder image](https://picsum.photos/600/300)

## Blockquotes

> This is a blockquote. It can contain multiple lines and is useful for highlighting quotes or important notes.
>
> It can span multiple paragraphs too.

## Code

Inline code: `const greeting = "Hello, world!";`

Code block with syntax highlighting:

```javascript
function fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

console.log(fibonacci(10)) // 55
```

```css
.blog-post {
  max-width: 65ch;
  margin: 0 auto;
  line-height: 1.6;
}
```

## Tables

| Feature             | Supported | Notes            |
| ------------------- | :-------: | ---------------- |
| Bold                |    Yes    | Use `**text**`   |
| Italic              |    Yes    | Use `*text*`     |
| Tables              |    Yes    | As shown here    |
| Syntax Highlighting |  Partial  | Depends on setup |

## Horizontal Rule

Content above the rule.

---

Content below the rule.

## Long Content Test

This section tests how longer paragraphs flow. Writing good technical content requires clarity and precision. Each sentence should build upon the last, creating a coherent narrative that guides the reader through complex topics. When explaining code or technical concepts, it's important to balance depth with accessibility.

Here's another paragraph to test spacing between blocks. The rhythm of a blog post matters - too dense and readers get lost, too sparse and it feels insubstantial. Finding the right balance takes practice and iteration.
