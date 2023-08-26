<script>
	import avatarImage from '$lib/images/avatar.webp';

	/** @type {import('./$types').PageData} */
	// export let data;
</script>

<div class="h-full flex flex-col">
	<!-- Header -->
	<header class="sticky top-0 flex justify-start items-center gap-8 py-2 px-4 ">
		<div class="contents py-2 px-4 border-b order-b border-surface-300 border-dashed">
			<span class="text-lg">Caidan W.</span>

			<nav class="flex gap-4">
				<a href="/">/About</a>
				<a href="/blog">/Blog</a>
				<a href="/widgets">/Widgets</a>
			</nav>
		</div>
	</header>

	<!-- Main -->
	<main class="grow container mx-auto max-w-screen-lg p-4 flex flex-col">
		<header class="flex flex-row">
			<div id="header-title" class="contents">
				<!-- <img
					id="avatar"
					src={avatarImage}
					alt="Avatar"
					class="w-64 float-right border border-rose-600 rounded-full"
				/> -->
				<h1 class="text-5xl font-bold text-end leading-relaxed mr-10">Hey there 👋</h1>
				<h2 class="text-4xl font-semibold">
					My name is
					<span
						class="text-5xl text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 from-10% via-emerald-500 via-30% to-emerald-800 to-80%"
					>
						Caidan
					</span>
				</h2>
				<p class="text-3xl font-light">
					I'm a software engineer with a thirst for knowledge and a passion for building.
				</p>
				<p class="text-2xl font-light italic text-end ">Welcome to my online home!</p>
				<img
					id="avatar"
					src={avatarImage}
					alt="Avatar"
					class="w-64 border border-rose-600 rounded-full"
				/>
			</div>
		</header>
		<section>Section 1</section>
	</main>
</div>
