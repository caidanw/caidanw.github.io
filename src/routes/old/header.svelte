<script>
	import avatarImage from '$lib/images/avatar.webp';
	import githubIcon from '$lib/images/icon_github.svg';
	import linkedinIcon from '$lib/images/icon_linkedin.svg';
	import codersrankIcon from '$lib/images/icon_cr.svg';
	import resumeIcon from '$lib/images/icon_resume.svg';

	export let subtitleTags = ['Software Engineer', 'Artist', 'Musician', 'Seattle, WA'];
	export let socialLinks = [
		{ name: 'GitHub', url: 'https://github.com/caidanw', icon: githubIcon },
		{ name: 'LinkedIn', url: 'https://www.linkedin.com/in/caidan-williams/', icon: linkedinIcon },
		{
			name: 'CodersRank',
			url: 'https://profile.codersrank.io/user/caidanw/',
			icon: codersrankIcon
		},
		{ name: 'Resume', url: 'https://registry.jsonresume.org/caidanw', icon: resumeIcon }
	];

	const tagSeperator = '<span class="opacity-50"> • </span>';
</script>

<header class="flex flex-col md:flex-row items-center">
	<div class="w-full space-y-4">
		<div class="grid grid-flow-col">
			<div id="header-title" class="w-full">
				<p class="text-5xl font-bold">Hey there 👋 <br /> I'm Caidan Williams</p>
				<p class="text-3xl font-light">
					a software engineer who loves building intuitive solutions for human problems; Welcome to
					my online home!
				</p>
			</div>
			<div class="col-span-2">
				<img
					id="avatar"
					src={avatarImage}
					alt="Avatar"
					class="border-4 border-rose-500 rounded-xl max-w-xs hidden md:block"
				/>
			</div>
		</div>

		<hr class="opacity-50" />

		<div id="header-subtitle" class="w-full">
			<span class="text-xl font-light">
				{@html subtitleTags.join(tagSeperator)}
			</span>
		</div>
		<div id="socials" class="flex flex-wrap w-full gap-2">
			{#each socialLinks as social}
				<a
					href={social.url}
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center space-x-2 px-2 py-1 rounded-lg font-semibold text-rose-500 bg-stone-700"
				>
					<img src={social.icon} alt={social.name} class="flex-row w-6 h-6" />
					<span>{social.name}</span>
				</a>
			{/each}
		</div>
	</div>
</header>
