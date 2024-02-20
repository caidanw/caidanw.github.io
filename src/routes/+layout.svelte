<script>
	import '../app.pcss';

	import { page } from '$app/stores';
	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import { cn } from '$lib/utils';

	const siteRoutes = [
		{ name: '/home', url: '/' },
		{ name: '/writing', url: '/writing' },
		{ name: '/widgets', url: '/widgets' },
		{ name: '/resume', url: '/resume' }
	];

	const externalRoutes = [
		{ name: 'GitHub', url: 'https://github.com/caidanw' },
		{ name: 'LinkedIn', url: 'https://www.linkedin.com/in/caidan-williams/' }
	];
</script>

<HolyGrailLayout class="container mx-auto" stickyHeader>
	<!-- Header -->
	<div
		slot="header"
		class={cn(
			'mb-4 flex items-start justify-between gap-2 py-3 md:mb-8',
			'border-y-[3px] border-dashed border-light/50 bg-dark/50 backdrop-blur'
		)}
	>
		<span class="group inline-flex whitespace-nowrap font-mono text-2xl leading-7">
			<span>Caidan W</span>
			<i class="animate-pulse group-hover:animate-none">.</i>
			<i class="opacity-0 transition delay-150 ease-out group-hover:opacity-100">.</i>
			<i class="opacity-0 transition delay-300 ease-out group-hover:opacity-100">.</i>
		</span>

		<nav class="font-mono text-lg font-bold">
			<ul class="flex flex-wrap justify-end gap-2">
				{#each siteRoutes as { name, url }}
					<li
						class={cn(
							'rounded px-1.5 transition-colors hover:text-emerald-500',
							url === $page.url.pathname && 'bg-light/10 text-emerald-500'
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
		class="mt-6 flex items-center justify-between gap-8 border-t-[3px] border-dashed border-light/50 bg-dark pt-3"
	>
		<nav class="font-mono text-lg font-semibold">
			<ul class="flex gap-4">
				{#each externalRoutes as { name, url }}
					<li class="rounded px-1.5 transition-colors hover:text-emerald-500">
						<a href={url} rel="me">{name}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</HolyGrailLayout>
