<script context="module">
	import dayjs from 'dayjs';
	import duration from 'dayjs/plugin/duration';

	dayjs.extend(duration);
</script>

<script>
	import { onMount } from 'svelte';

	const birthDate = dayjs('1999-01-21T23:02:00-07:00');
	const getCurrentAge = () => dayjs.duration(dayjs().diff(birthDate));

	let age = dayjs.duration();

	onMount(() => {
		const interval = setInterval(() => {
			age = getCurrentAge();
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});
</script>

<div class="inline-flex flex-row space-x-2">
	<span class="text-lg font-medium">Life Clock</span>
	<span class="rounded-lg border-2 px-1.5 py-0.5 font-mono font-semibold">
		{age.format('YY')}y {age.format('MM')}m {age.format('DD')}d
		{age.format('HH')}h {age.format('mm')}m {age.format('ss')}s
	</span>
</div>
