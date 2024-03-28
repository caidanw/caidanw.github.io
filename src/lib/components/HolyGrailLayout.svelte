<script lang="ts">
	import { cn } from '../utils';

	let className: string | undefined | null = undefined;
	export { className as class };
	export let stickyHeader = false;
</script>

<!-- Layout Parent -->
<div class={cn('parent px-4 py-6', className)}>
	<!-- Header -->
	{#if $$slots.header}
		<header class={cn(stickyHeader && 'sticky top-0')}>
			<slot name="header" />
		</header>
	{/if}

	<!-- Left Sidebar -->
	{#if $$slots.leftSide}
		<div class="left-side">
			<slot name="leftSide" />
		</div>
	{/if}

	<!-- Main Page Content -->
	{#if $$slots.main}
		<main>
			<slot name="main" />
		</main>
	{/if}

	<!-- Right Sidebar -->
	{#if $$slots.rightSide}
		<div class="right-side">
			<slot name="rightSide" />
		</div>
	{/if}

	<!-- Footer -->
	{#if $$slots.footer}
		<footer>
			<slot name="footer" />
		</footer>
	{/if}
</div>

<style>
	.parent {
		display: grid;
		grid-template: auto 1fr auto / auto 1fr auto;
	}

	header {
		grid-column: 1 / 4;
	}

	.left-side {
		grid-column: 1 / 2;
	}

	main {
		grid-column: 2 / 3;
	}

	.right-side {
		grid-column: 3 / 4;
	}

	footer {
		grid-column: 1 / 4;
	}
</style>
