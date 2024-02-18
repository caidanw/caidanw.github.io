<script>
	import '../app.postcss';

	import HolyGrailLayout from '$lib/components/HolyGrailLayout.svelte';
	import { cn } from '$lib/utils';
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
		<span class="text-xl">Caidan Williams</span>

		<nav class="text-lg flex gap-4">
			<ul class="contents">
				<li><a href="/">/home</a></li>
				<li><a href="/blog">/blog</a></li>
				<li><a href="/widgets">/widgets</a></li>
				<li><a href="/resume">/resume</a></li>
			</ul>
		</nav>
	</div>

	<!-- Main Page Content -->
	<!-- <div slot="main" /> -->

	<slot slot="main" />

	<!-- Footer -->
	<div
		slot="footer"
		class="flex justify-between items-center gap-8 pt-3 mt-6 bg-dark border-t-[3px] border-light/50 border-dashed"
	>
		Footer
	</div>
</HolyGrailLayout>
