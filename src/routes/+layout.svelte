<script>
	import '../app.pcss';

	import { page } from '$app/stores';
	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import { cn } from '$lib/utils';

	const siteRoutes = [
		{ name: '/home', url: '/' },
		// { name: '/writing', url: '/writing' },
		// { name: '/widgets', url: '/widgets' },
		{
			name: '/resume',
			url: 'https://caidan-my.sharepoint.com/:b:/g/personal/me_caidan_dev/EcMqP0jC_VtIttsG8Q58-uYBN_jnnl_sDmbWQpQ4daPRTQ'
		}
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
			'-mx-3 mb-4 flex flex-wrap items-start justify-between gap-2 px-3 py-3 md:mb-8',
			'rounded-2xl border-y-[3px] border-dashed border-light/50 bg-dark/50 backdrop-blur'
		)}
	>
		{#snippet dot(delay)}
			<i
				class="relative -top-4 opacity-0 transition-all duration-300 group-hover:inset-0 group-hover:opacity-100"
				style="transition-delay: {delay}ms;">.</i
			>
		{/snippet}

		<span class="group inline-flex whitespace-nowrap font-mono text-2xl leading-7">
			<span>Caidan W</span>
			<i class="animate-pulse group-hover:animate-none">.</i>
			{@render dot(150)}
			{@render dot(300)}
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
