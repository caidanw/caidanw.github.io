<script>
	import avatarImage from '$lib/images/avatar.webp';
	import HolyGrailLayout from '../lib/components/HolyGrailLayout.svelte';
	import { cn } from '../lib/utils';

	/** @type {import('./$types').PageData} */
	// export let data;
</script>

<HolyGrailLayout>
	<!-- Header -->
	<div
		slot="header"
		class="flex justify-between items-center gap-8 py-3 mb-6 bg-dark border-y border-surface-300 border-dashed"
	>
		<span class="text-xl">Caidan W.</span>

		<nav class="flex gap-4">
			<a href="/">/home</a>
			<a href="/blog">/blog</a>
			<a href="/widgets">/widgets</a>
			<a href="/resume">/resume</a>
		</nav>
	</div>

	<!-- Main Page Content -->
	<div slot="main" class="">
		<header class="grid grid-cols-4">
			<div class="col-span-3 grid row-auto">
				<h1 class="text-5xl font-bold text-end leading-relaxed mr-10">Hey there 👋</h1>
				<h2 class="text-4xl font-semibold">
					My name is
					<span
						class={cn(
							'text-5xl text-transparent bg-clip-text',
							// 'from-emerald-400 via-emerald-500 to-emerald-900',
							'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
						)}
					>
						Caidan
					</span>
				</h2>
				<p class="text-3xl font-light">
					I'm a software engineer with a thirst for knowledge and a passion for building.
				</p>
				<p class="text-2xl font-light italic text-end leading-loose justify-self-center">
					Welcome to my online home!
				</p>
			</div>
			<div
				class={cn(
					'w-64 h-64 rounded-full p-1.5',
					'bg-gradient-to-r from-fuchsia-500 via-red-600 to-orange-400'
				)}
			>
				<img id="avatar" src={avatarImage} alt="Avatar" class="aspect-square rounded-full" />
			</div>
		</header>
	</div>

	<!-- Footer -->
	<div
		slot="footer"
		class="flex justify-between items-center gap-8 pt-3 mt-6 bg-dark border-t border-surface-300 border-dashed"
	>
		Footer
	</div>
</HolyGrailLayout>

<div class="hidden container mx-auto h-full flex flex-col items-center">
	<!-- Header -->
	<header class="sticky -top-8 py-8 px-4 w-full" />

	<!-- Main -->
	<main class="grow max-w-screen-lg p-4 flex flex-col">
		<header class="grid grid-cols-4">
			<div class="col-span-3 grid row-auto">
				<h1 class="text-5xl font-bold text-end leading-relaxed mr-10">Hey there 👋</h1>
				<h2 class="text-4xl font-semibold">
					My name is
					<span
						class={cn(
							'text-5xl text-transparent bg-clip-text bg-gradient-to-br',
							'from-emerald-300 from-10% via-emerald-500 via-30% to-emerald-800 to-80%'
						)}
					>
						Caidan
					</span>
				</h2>
				<p class="text-3xl font-light">
					I'm a software engineer with a thirst for knowledge and a passion for building.
				</p>
				<p class="text-2xl font-light italic text-end leading-loose mr-20">
					Welcome to my online home!
				</p>
			</div>
			<div
				class="w-64 h-64 rounded-full p-1.5 bg-gradient-to-br from-emerald-300 from-10% via-emerald-500 via-30% to-emerald-800 to-80%"
			>
				<img
					id="avatar"
					src={avatarImage}
					alt="Avatar"
					class="aspect-square basis-1/4 rounded-full"
				/>
			</div>
		</header>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
		<section>Section 1</section>
	</main>
</div>
