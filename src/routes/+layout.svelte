<script>
	import '../app.postcss';

	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import { cn } from '$lib/utils';

	const routes = [
		{ name: '/home', url: '/' },
		{ name: '/blog', url: '/blog' },
		{ name: '/widgets', url: '/widgets' },
		{ name: '/resume', url: '/resume' },
	];
</script>

<HolyGrailLayout class="container mx-auto" stickyHeader>
	<!-- Header -->
	<div
		slot="header"
		class={cn(
			'flex justify-between items-center gap-8 py-3 mb-4 md:mb-8',
			'bg-dark/50 backdrop-blur border-y-[3px] border-light/50 border-dashed',
		)}
	>
		<span class="text-xl font-mono">Caidan Williams</span>

		<nav class="text-lg font-mono">
			<ul class="flex gap-4">
				{#each routes as { name, url }}
					<li class="hover:bg-emerald-800 rounded px-1">
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
		Footer
	</div>
</HolyGrailLayout>
