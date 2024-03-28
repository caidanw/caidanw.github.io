<script>
	import '../app.pcss';

	import { page } from '$app/stores';
	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import SocialLinks from '$lib/components/SocialLinks.svelte';
	import { resume, shortname } from '$lib/info';
	import { cn } from '$lib/utils';

	const siteRoutes = [
		{ name: '/home', url: '/' },
		{ name: '/blog', url: '/blog' },
		// { name: '/projects', url: '/projects' },
		// { name: '/widgets', url: '/widgets' },
		{ name: '/resume', url: resume }
	];
</script>

<HolyGrailLayout class="container mx-auto" stickyHeader>
	<!-- Header -->
	<div
		slot="header"
		class={cn(
			'-mx-3 mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-3 md:mb-8',
			'rounded-2xl border-y-[2px] border-dashed border-light/50 bg-dark/50 backdrop-blur'
		)}
	>
		{#snippet dot(delay)}
			<i
				class="relative -top-4 opacity-0 transition-all duration-300 group-hover:inset-0 group-hover:opacity-100"
				style="transition-delay: {delay}ms;">.</i
			>
		{/snippet}

		<span class="group inline-flex whitespace-nowrap font-mono text-2xl leading-7">
			<span>{shortname}</span>
			<i class="animate-pulse group-hover:animate-none">.</i>
			{@render dot(150)}
			{@render dot(300)}
		</span>

		<nav class="font-mono text-lg font-semibold">
			<ul class="flex flex-wrap justify-end gap-1.5">
				{#each siteRoutes as { name, url }}
					<li
						class={cn(
							'rounded px-1.5 transition hover:text-accent-600',
							url === $page.url.pathname && 'bg-light/10 text-accent-600',
							name === '/resume' && 'pr-0'
						)}
					>
						<a href={url}>{name}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>

	<!-- Main Page Content -->
	<svelte:fragment slot="main">
		<slot />
	</svelte:fragment>

	<!-- Footer -->
	<div
		slot="footer"
		class="mt-12 flex items-center justify-between gap-8 border-t-[2px] border-dashed border-light/50 pt-3"
	>
		<nav class="flex grow items-center justify-end gap-3">
			<SocialLinks />
		</nav>
	</div>
</HolyGrailLayout>
