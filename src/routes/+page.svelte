<script lang="ts">
	import avatarImage from '$lib/images/avatar.png';
	import { cn } from '$lib/utils';
</script>

<!-- Intro Header -->
<header class="flex select-none justify-evenly gap-2">
	<div class="row-auto grid justify-items-start gap-4">
		<h1 class="justify-self-end text-5xl font-semibold leading-loose md:text-6xl">Hey there 👋</h1>
		<h2 class="align-bottom text-3xl font-semibold md:text-4xl">
			My name is
			<span
				class={cn(
					'bg-clip-text text-4xl font-bold text-transparent md:text-5xl',
					'bg-gradient-to-br from-emerald-300 from-30% via-emerald-500 via-40% to-emerald-800 to-70%'
				)}
			>
				Caidan
			</span>
		</h2>
		<p class="text-pretty text-2xl font-light leading-tight md:text-3xl">
			I'm a software engineer with a thirst for knowledge and a passion for building.
		</p>
		<p class="justify-self-center text-xl font-light italic md:text-2xl">
			Welcome to my online home!
		</p>
	</div>
	<div
		class={cn(
			'my-auto hidden md:block',
			'aspect-square h-64 w-64 rounded-full p-1.5',
			'bg-gradient-to-br from-emerald-300 from-30% via-emerald-500 via-40% to-emerald-800 to-70%'
		)}
	>
		<img id="avatar" src={avatarImage} alt="Headshot of Caidan" class="rounded-full" />
	</div>
</header>
