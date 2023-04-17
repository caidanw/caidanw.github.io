<script>
	import LifeClock from '../lib/components/lifeClock.svelte';
	import Footer from './footer.svelte';
	import Header from './header.svelte';

	const username = 'caidanw';
</script>

<main class="space-y-8">
	<Header />

	<div class="px-10" />

	<section class="space-y-4">
		<p class="text-3xl font-semibold">Coding Activity & Stats</p>

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

	<Footer />
</main>

<style lang="postcss">
	codersrank-summary {
		--bg-color: transparent;
		--header-bg-color: theme(colors.stone.800);
		--header-text-color: theme(colors.stone.100);
		--badge-bg-color: theme(colors.stone.800);
		--badge-text-color: theme(colors.stone.100);
		--badges-padding: 0.5rem 0rem;
		--border-radius: 8px;
		--badge-border-radius: 8px;
	}

	codersrank-activity {
		--bg-color-0: theme(colors.stone.800);
		--bg-color-1: theme(colors.rose.200);
		--bg-color-2: theme(colors.rose.400);
		--bg-color-3: theme(colors.rose.600);
		--bg-color-4: theme(colors.rose.800);
		--legend-margin: 0;
		--label-text-color: theme(colors.stone.500);
	}

	codersrank-skills-chart {
		--chart-bg-color: theme(colors.stone.800);
		--chart-border-radius: 8px;
		--label-text-color: theme(colors.stone.100);
		--legend-text-color: theme(colors.stone.100);
	}

	codersrank-portfolio {
		--item-bg-color: theme(colors.stone.800);
		--item-padding: 0.5rem;
		--item-border-radius: 8px;
		--item-spacing: 1rem;
		--tag-bg-color: theme(colors.stone.700);
		--link-hover-bg-color: theme(colors.stone.700);
		--link-text-color: theme(colors.rose.500);
	}

	codersrank-work-experience {
		--item-bg-color: theme(colors.stone.800);
		--item-padding: 0.5rem;
		--item-border-radius: 8px;
		--item-spacing: 1rem;
		--tag-bg-color: theme(colors.stone.700);
	}
</style>
