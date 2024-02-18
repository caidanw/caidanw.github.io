<script>
	import avatarImage from '$lib/images/avatar.jpeg';
	import { cn } from '$lib/utils';

	/** @type {import('./$types').PageData} */
	// export let data;
</script>

<!-- Intro Header -->
<header class="flex justify-evenly gap-2 select-none">
	<div class="grid row-auto justify-items-start gap-4">
		<h1 class="justify-self-end text-5xl md:text-6xl font-semibold leading-loose">Hey there 👋</h1>
		<h2 class="text-3xl md:text-4xl font-semibold align-bottom">
			My name is
			<span
				class={cn(
					'text-4xl md:text-5xl text-transparent font-bold bg-clip-text',
					'bg-gradient-to-br from-emerald-300 from-30% via-emerald-500 via-40% to-emerald-700 to-70%'
				)}
			>
				Caidan
			</span>
		</h2>
		<p class="text-2xl md:text-3xl font-light leading-tight">
			I'm a software engineer with a thirst for knowledge and a passion for building.
		</p>
		<p class="justify-self-center text-xl md:text-2xl font-light italic">
			Welcome to my online home!
		</p>
	</div>
	<div
		class={cn(
			'hidden md:block my-auto',
			'w-64 h-64 aspect-square rounded-full p-1.5',
			'bg-gradient-to-br from-emerald-300 from-30% via-emerald-500 via-40% to-emerald-800 to-70%'
		)}
	>
		<img id="avatar" src={avatarImage} alt="Avatar" class="rounded-full" />
	</div>
</header>
