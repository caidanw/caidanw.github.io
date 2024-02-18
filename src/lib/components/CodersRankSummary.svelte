<script>
	import { onMount } from 'svelte/types/runtime/internal/lifecycle';

	export let username;

	const userEndpoint = `https://api.codersrank.io/v2/users/${username}/`;
	const badgesEndpoint = `https://api.codersrank.io/v2/users/${username}/badges`;

	let data = {};

	const getUser = () =>
		fetch(userEndpoint, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		}).then((res) => res.json());

	const getBadges = () =>
		fetch(badgesEndpoint, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		}).then((res) => res.json());

	onMount(async () => {
		const user = await getUser();
		const badges = await getBadges();

		data = {
			...user,
			...badges,
		};
	});
</script>
