---
layout: project
title: mildmelon.github.io
permalink: mildmelon-github-io
demo_url: /
source_url: https://github.com/mildmelon/mildmelon.github.io
tags: [Ruby, Jekyll, Markdown, VS Code, Linux]
---

# About

This project is the site you are currently using; it's purpose is to host my blog, portfolio, and resume.

In 2017, I had decided that I would host a blog and portfolio site. My first instinct was to pay for a VPS so I could maintain full control over the backend. That was until I realized I didn't want to spend $5-$10 a month on hosting. My next thought was to use GitHub Pages, as it's free and maintainable just by pushing commits to a repository. This means I had to use a Static Site Generator, after researching different ones that might be a good fit I landed on <a href="https://blog.getpelican.com/" target="_blank">Pelican</a>, mostly because I wanted to use python. After getting it setup and working I really didn't have any qualms with it, except that I had to manually render it on a dev branch, copy the file to a separate directory, switch to my master branch, and finally push it all up. This wasn't terrible at first, but soon it became annoying. This lead me to stop blogging and eventually I ended up abandoning the site.

In the beginning of November 2019 I was looking for new career opportunities, and this lead me to rewrite my website. The theme was terrible, the markdown converter was hot garbage, and everything was extremely disorganized. I tried to save the original site, but there was so much to relearn about _Pelican_ that I just didn't want to spend my time on. I found out that GitHub Pages natively supports Jekyll, and having never previously worked with Ruby or Jekyll, I decided to give it a try. I was deeply inclined to find an easy to read theme after how my last site turned out. I ended up settling on <a href="https://github.com/b2a3e8/jekyll-theme-console" target="_blank">jekyll-theme-console</a> as the base theme for this site, even though it was missing a few pages I wanted: about me (home), blog, portfolio, and resume. I decided I'd dive in and start implementing new features and pages that were missing.

To my surprise, Jekyll and Ruby were really easy to pickup and learn. I started updating the site on Nov 5, 2019 and as I write this it's Nov 8, 2019. It took me a full three evenings to write everything you see. Don't believe me? Checkout my git history: <a href="https://github.com/mildmelon/mildmelon.github.io/commit/ba8490bb04e889883787d30e84efa64067591467" target="_blank">start</a> <a href="https://github.com/mildmelon/mildmelon.github.io/commit/349e3429f4731ffae3d80acd93330b5d0bff68d9" target="_blank">now</a>.

**Initial issues with the theme:**
- Pure black background which I felt was too dark and wasn't as warm and welcoming.
- Small font and max width of 600px.
- Blog posts were on the home page, I prefer them on a separate page because I don't want focus to be on my blog.
- Code snippets were difficult to read because they used the same pure black background.
- No portfolio or similar place to display my projects.
- Contact form background color is pure black making it hard to tell where an input starts and ends.
- Name and email inputs were not required, and had no identification of missing or invalid input.
- No link or page for a resume.

**Modifications to the theme based on my personal taste and criteria:**
- Dark grey background which helps reduce contrast and looks better on most displays.
- Larger font and max width of 90% instead of hard coded value.
- Blog posts moved to a separate [/blog](/blog) page where they won't be the main point of attraction for this site.
- Also post now have Previous/Next navigation buttons.
- Added better background and padding to code snippets for easier readability.
- Inline code uses the same background as full code snippets.
- Created [/portfolio](/portfolio) page to display my best projects, with included tags demonstrating what the project was built with.
- Project page displays a live demo and source code button, and styling tags in a clean way.
- Added more social links in the footer, including RSS (even though I doubt anyone uses it anymore).
- Contact form has a clear separation of input fields and requires name/email field with red box-shadow on invalid input.
- To protect against bots scraping my email for spam I used Google Forms as my POST endpoint, with an extra "gotcha" input to help filter out spam.
- Incorporate a special header link that redirects to a PDF version of my resume hosted on Google Docs.