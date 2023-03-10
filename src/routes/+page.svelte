<script>
	import LifeClock from '../lib/components/lifeClock.svelte';
	import Header from './header.svelte';

	const username = 'caidanw';
	const currentYear = new Date().getFullYear();
</script>

<main class="space-y-8">
	<Header />

	<div class="px-10" />

	<section class="space-y-4">
		<p class="text-3xl font-semibold">My Coding Activity & Stats</p>

		<!-- Summary widget -->
		<codersrank-summary {username} branding="false" show-avatar="false" min-width="640" />

		<!-- Activity widget -->
		<codersrank-activity
			{username}
			branding="false"
			labels
			legend
			tooltip
			step="3"
			svg-width="800"
		/>

		<!-- Skills chart widget -->
		<codersrank-skills-chart
			{username}
			branding="false"
			labels
			legend
			tooltip
			svg-width="1200"
			svg-height="400"
		/>
	</section>
	<section class="space-y-4">
		<p class="text-3xl font-semibold">Recent Projects</p>

		<!-- Portfolio widget -->
		<codersrank-portfolio {username} branding="false" logos />

		<!-- <p class="text-3xl font-semibold">Fun Widgets I Made</p> -->
		<!-- <LifeClock /> -->
	</section>
	<section class="space-y-4">
		<p class="text-3xl font-semibold">Work Experience</p>

		<!-- Work experience widget -->
		<codersrank-work-experience {username} branding="false" logos />
	</section>

	<footer class="text-center opacity-60">Copyright &copy; {currentYear} Caidan Williams</footer>
</main>
