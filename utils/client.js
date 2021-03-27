import Prismic from '@prismicio/client';
const apiEndpoint = 'https://alexthings-sveltekit.cdn.prismic.io/api/v2';
export const accessToken = '';
export const options = { lang: 'en-gb' };
export const client = Prismic.client(apiEndpoint);