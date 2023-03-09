<script>
	import avatarImage from '$lib/images/avatar.webp';
	import githubIcon from '$lib/images/icon_github.svg';
	import linkedinIcon from '$lib/images/icon_linkedin.svg';
	import codersrankIcon from '$lib/images/icon_cr.svg';

	export let subtitleTags = ['Software Engineer', 'Artist', 'Musician', 'Seattle, WA ☕'];
	export let socialLinks = [
		{ name: 'GitHub', url: 'https://github.com/caidanw', icon: githubIcon },
		{ name: 'LinkedIn', url: 'https://www.linkedin.com/in/caidan-williams/', icon: linkedinIcon },
		{ name: 'CodersRank', url: 'https://profile.codersrank.io/user/caidanw/', icon: codersrankIcon }
	];

	const tagSeperator = '<span class="opacity-50"> • </span>';
</script>

<header class="flex items-center">
	<img
		id="avatar"
		src={avatarImage}
		alt="Avatar"
		class="border-4 border-rose-500 rounded-full w-1/5 h-auto mr-8"
	/>
	<div class="w-full space-y-4">
		<div id="header-title" class="w-full">
			<p class="text-5xl font-bold">Hey there 👋 <br /> I'm Caidan Williams</p>
			<p class="text-3xl font-light">
				a software engineer who loves building intuitive solutions for human problems; Welcome to my online home!
			</p>
		</div>
		<hr class="mx-2" />
		<div id="header-subtitle" class="w-full">
			<p class="text-2xl font-light">
				{@html subtitleTags.join(tagSeperator)}
			</p>
		</div>
		<div id="socials" class="flex w-full space-x-4">
			{#each socialLinks as social}
				<a
					href={social.url}
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center space-x-2 border-2 px-2 py-1 rounded-lg"
				>
					<img src={social.icon} alt={social.name} class="flex-row w-6 h-6" />
					<span>{social.name}</span>
				</a>
			{/each}
		</div>
	</div>
</header>
