import { dev } from '$app/environment';
import { slugify } from '$lib/utils';
import dayjs from 'dayjs';
import frontmatterExtract from 'remark-extract-frontmatter';
import frontmatterParse from 'remark-frontmatter';
import markdownParse from 'remark-parse';
import markdownStringify from 'remark-stringify';
import { unified } from 'unified';
import { VFile } from 'vfile';
import reporter from 'vfile-reporter';
import yaml from 'yaml';

interface PostMetadata {
	title: string;
	date: string;
	draft: boolean;
	tags: string[];
}

interface Post {
	slug: string;
	title: string;
	date: string;
	draft: boolean;
	tags: string[];
}

const defaultPostMetadata: Partial<PostMetadata> = {
	draft: false
};

const processor = unified()
	.use(markdownParse)
	.use(markdownStringify)
	.use(frontmatterParse)
	.use(frontmatterExtract, { yaml: yaml.parse, remove: true });

// Get all posts with metadata
export const posts = Object.entries(
	import.meta.glob<string>('/src/posts/*.md', { eager: true, query: '?raw', import: 'default' })
)
	.map(([filepath, content]) => {
		// Process the post content with a custon Unified plugin chain
		const file = processor.processSync(new VFile({ path: filepath, value: content }));
		console.error(reporter(file));

		if (!file.stem) {
			throw Error('Invalid post name');
		}

		// Get the processed file metadata (aka markdown frontmatter)
		const metadata = file.data as unknown as PostMetadata;
		return {
			...defaultPostMetadata,
			...metadata,

			// Generate the slug from file name
			slug: slugify(file.stem)
		} as Post;
	})
	.filter((post) => !!post)
	.filter((post) => dev || !post.draft)
	.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
