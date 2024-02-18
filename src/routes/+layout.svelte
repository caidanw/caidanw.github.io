<script>
	import '../app.postcss';

	import { page } from '$app/stores';
	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import { cn } from '$lib/utils';

	const siteRoutes = [
		{ name: '/home', url: '/' },
		{ name: '/writing', url: '/blog' },
		{ name: '/widgets', url: '/widgets' },
		{ name: '/resume', url: '/resume' },
	];

	const externalRoutes = [
		{ name: 'GitHub', url: 'https://github.com/caidanw' },
		{ name: 'LinkedIn', url: 'https://www.linkedin.com/in/caidan-williams/' },
	];
</script>

<HolyGrailLayout class="container mx-auto" stickyHeader>
	<!-- Header -->
	<div
		slot="header"
		class={cn(
			'flex justify-between items-center gap-2 py-3 mb-4 md:mb-8',
			'bg-dark/50 backdrop-blur border-y-[3px] border-light/50 border-dashed',
		)}
	>
		<span class="group inline-flex text-2xl leading-7 font-mono">
			<span>Caidan W</span>
			<i class="animate-pulse group-hover:animate-none">.</i>
			<i class="transition opacity-0 group-hover:opacity-100 delay-150 ease-out">.</i>
			<i class="transition opacity-0 group-hover:opacity-100 delay-300 ease-out">.</i>
		</span>

		<nav class="text-lg font-mono font-bold">
			<ul class="flex flex-wrap justify-end gap-2">
				{#each siteRoutes as { name, url }}
					<li
						class={cn(
							'hover:text-emerald-500 rounded px-1.5 transition-colors',
							url === $page.url.pathname && 'text-emerald-500 bg-light/10',
						)}
					>
						<a href={url}>{name}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>

	<!-- Main Page Content -->
	<slot slot="main" />

	<!-- Footer -->
	<div
		slot="footer"
		class="flex justify-between items-center gap-8 pt-3 mt-6 bg-dark border-t-[3px] border-light/50 border-dashed"
	>
		<nav class="text-lg font-mono font-semibold">
			<ul class="flex gap-4">
				{#each externalRoutes as { name, url }}
					<li class="hover:text-emerald-500 rounded px-1.5 transition-colors">
						<a href={url}>{name}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</HolyGrailLayout>
