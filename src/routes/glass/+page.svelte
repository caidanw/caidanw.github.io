<script>
	/** @type {import('./$types').PageData} */
	export let data;
</script>

<section id="page">
	<div class="card-glass">test</div>
</section>

<style>
	.card-glass {
		height: 100%;

		padding: 1rem;
		border-radius: 1rem;

		/* Background and transparency */
		background: hsla(0, 0%, 70%, 0.2);
		backdrop-filter: blur(0.2rem);

		/* Box shadow for a glassy effect */
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

		border: 1px solid hsla(0, 0%, 70%, 0.2);
	}

	#page {
		height: 100%;
		padding: 4rem;

		/* Set background color as a fallback */
		background-color: #f0f0f0;

		/* Set background image and specify its repeat behavior */
		background-image: linear-gradient(45deg, #3498db, #2ecc71);
		background-repeat: repeat;
	}
</style>
