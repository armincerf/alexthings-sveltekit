<script>
	import { onMount } from 'svelte';
	import './../styles/reset.scss';
	import './../styles/globals.scss';
	onMount(async () => {
        document.getElementsByTagName('html')[0].className += ' js';
		let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		document.documentElement.setAttribute('data-theme', theme);
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			theme = e.matches ? 'dark' : 'light';
			document.documentElement.setAttribute('data-theme', theme);
		});
	});
</script>

<div class="flex-layout">
	<slot />
	<p class="footer">© Acme Corp, 1951</p>
</div>

<style>
	.footer {
		margin: 3rem 0;
		text-align: center;
	}

	.flex-layout {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
</style>
