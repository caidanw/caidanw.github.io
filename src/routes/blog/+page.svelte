<script lang="ts">
	import { formatDate } from '$lib/utils/datetime';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<div class="flex flex-grow flex-col">
	<header>
		<h1 class="text-2xl font-bold sm:text-4xl">
			Writing on tech, art, music, and whatever else I feel like
		</h1>
		<p class="mt-2">All of my written content collected in one place</p>
	</header>

	<section class="mt-8 sm:mt-10">
		<ul class="grid gap-8">
			{#each data.posts as post}
				<li>
					<a class="text-2xl" href="blog/{post.slug}">{post.title}</a>
					<p>{formatDate(post.date)}</p>
				</li>
			{/each}
		</ul>
	</section>

	<!-- pagination -->
	<!-- <div class="flex items-center justify-between pb-8 pt-16">
		{#if !isFirstPage}
			<a href={`/posts/${data.page - 1}`} data-sveltekit-prefetch>
				<ArrowLeftIcon class="h-4 w-4" />
				Previous
			</a>
		{:else}
			<div />
		{/if}

		{#if hasNextPage}
			<a href={`/posts/${data.page + 1}`} data-sveltekit-prefetch
				>Next
				<ArrowRightIcon class="h-4 w-4" />
			</a>
		{/if}
	</div> -->
</div>
