// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://sabeeirsharrma.github.io',
	base: '/transit',
	integrations: [
		starlight({
			title: 'Transit',
			tagline: 'Languages that just talk to each other. No API. No middleman.',
			customCss: ['./src/styles/custom.css'],
			head: [
        {
          tag: 'meta',
          attrs: {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
          },
        },
      ],
			components: {
				Footer: './src/components/Footer.astro',
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/sabeeirsharrma/transit' },
			],
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Introduction', slug: 'guides/getting-started' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'Architecture', slug: 'reference/architecture' },
						{ label: 'Export Tiers', slug: 'reference/export-tiers' },
						{ label: 'Binary Protocol', slug: 'reference/binary-protocol' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'API Reference', slug: 'reference/api-reference' },
					],
				},
				{
					label: 'Contributing',
					items: [
						{ label: 'Contributing Guide', slug: 'guides/contributing' },
					],
				},
			],
		}),
	],
});
