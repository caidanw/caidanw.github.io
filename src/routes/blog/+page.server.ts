import { posts } from '$lib/server/data/posts';
import type { PageServerLoad } from './$types';

export const load = (async () => {
	return { posts };
}) satisfies PageServerLoad;
