<script>
	import avatarImage from '$lib/images/avatar.webp';
	const username = 'caidanw';
	const currentYear = new Date().getFullYear();
</script>

<main class="space-y-8">
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
					a software engineer who loves building intuitive tech solutions that simplify people's
					lives. Welcome to my online home!
				</p>
			</div>
	</header>

	<section>
		<p class="text-2xl">About Me</p>
		<p>
			Hi, I'm Caidan, a self-taught software engineer with over 10 years of experience in coding. I
			have a strong focus on data engineering and tool development, and I've spent most of my career
			working in the AI industry. I have a solid background in Python, JavaScript, TypeScript, Java,
			Bash, Ruby, GoLang, and Lua. I'm experienced in working with frameworks such as Flask, Django,
			React, Svelte, Spring Boot, and Jekyll. I'm also familiar with technologies such as Git,
			Docker, Linux, Kubernetes, MongoDB, PostgreSQL, Spark, and Redis.
		</p>
	</section>
	<section class="space-y-4">
		<p class="text-2xl">My Coding Activity & Stats</p>

		<!-- Summary widget -->
		<codersrank-summary {username} branding="false" show-avatar="false" min-width="640" />

		<!-- Activity widget -->
		<codersrank-activity {username} branding="false" labels legend tooltip step="3" svg-width="800" />

		<!-- Skills chart widget -->
		<codersrank-skills-chart {username} branding="false" labels legend tooltip svg-width="1200" svg-height="400"/>
	</section>
	<section class="space-y-4">
		<p class="text-2xl">Recent Projects</p>

		<!-- Portfolio widget -->
		<codersrank-portfolio {username} branding="false" logos></codersrank-portfolio>
	</section>
	<section class="space-y-4">
		<p class="text-2xl">Work Experience</p>

		<!-- Work experience widget -->
		<codersrank-work-experience {username} branding="false" logos />
	</section>

	<footer class="text-center opacity-60">Copyright &copy; {currentYear} Caidan Williams</footer>
</main>
