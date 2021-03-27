<script context="module">
	import { client, options } from './../../utils/client';

	export async function load() {
		const document = await client.getByUID('page', 'homepage', options);
		return {
			props: {
				document
			}
		};
	}
</script>

<script>
	export let document;
</script>

<main>
	<div class="header">
		<div class="inner-header flex">
			<h1>{document.data.title}</h1>
		</div>

		<div>
			<svg
				class="waves"
				xmlns="http://www.w3.org/2000/svg"
				xmlns:xlink="http://www.w3.org/1999/xlink"
				viewBox="0 24 150 28"
				preserveAspectRatio="none"
				shape-rendering="auto"
			>
				<defs>
					<path
						id="gentle-wave"
						d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
					/>
				</defs>
				<g class="parallax">
					<use xlink:href="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,0.7" />
					<use xlink:href="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,0.5)" />
					<use xlink:href="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,0.3)" />
					<use xlink:href="#gentle-wave" x="48" y="7" fill="#fff" />
				</g>
			</svg>
		</div>
	</div>

	<div class="content flex">
		<p>Alex Davis | {new Date().getFullYear()}</p>
	</div>
	<div class="container">
		<div class="text">
			{document.data.content}
		</div>
	</div>
</main>

<style>
	.header {
		color: white;
		background-size: cover;
		background: #355c7d; /* fallback for old browsers */
		background: linear-gradient(
			to right,
			#c06c84,
			#6c5b7b,
			#355c7d
		); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */
		min-height: 25vw;
		padding-top: 2rem;
		justify-content: flex-start;
	}

	h1 {
		font-family: 'Lato', sans-serif;
		font-weight: 300;
		letter-spacing: 2px;
		font-size: 48px;
	}

	p {
		font-family: 'Lato', sans-serif;
		letter-spacing: 1px;
		font-size: 14px;
		color: #333333;
	}

	.header {
		position: relative;
		text-align: center;
		background: linear-gradient(60deg, rgba(84, 58, 183, 1) 0%, rgba(0, 172, 193, 1) 100%);
		color: white;
	}

	.inner-header {
		height: 65vh;
		width: 100%;
		margin: 0;
		padding: 0;
	}

	.flex {
		/*Flexbox for containers*/
		display: flex;
		justify-content: center;
		align-items: center;
		text-align: center;
	}

	.waves {
		position: relative;
		width: 100%;
		height: 15vh;
		margin-bottom: -7px;
		/*Fix for safari gap*/
		min-height: 100px;
		max-height: 150px;
	}

	.content {
		position: relative;
		height: 20vh;
		text-align: center;
		background-color: white;
	}

	/* Animation */

	.parallax > use {
		animation: move-forever 50s cubic-bezier(0.55, 0.5, 0.45, 0.5) infinite;
	}

	.parallax > use:nth-child(1) {
		animation-delay: -4s;
		animation-duration: 24s;
	}

	.parallax > use:nth-child(2) {
		animation-delay: -6s;
		animation-duration: 40s;
	}

	.parallax > use:nth-child(3) {
		animation-delay: -8s;
		animation-duration: 46s;
	}

	.parallax > use:nth-child(4) {
		animation-delay: -10s;
		animation-duration: 80s;
	}

	@keyframes move-forever {
		0% {
			transform: translate3d(-90px, 0, 0);
		}
		100% {
			transform: translate3d(85px, 0, 0);
		}
	}

	/*Shrinking for mobile*/

	@media (max-width: 768px) {
		.waves {
			height: 40px;
			min-height: 40px;
		}
		.content {
			height: 30vh;
		}
		h1 {
			font-size: 24px;
		}
	}
</style>
