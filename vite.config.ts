import packageJson from './package.json' with { type: 'json' };
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

export default defineConfig(({ mode }) => {
  const configuredSiteUrl = loadEnv(mode, '.', 'SITE_URL').SITE_URL;
  if (!configuredSiteUrl) {
    throw new Error('Set SITE_URL to an HTTPS origin before running Vite.');
  }

  let parsedSiteUrl: URL;

  try {
    parsedSiteUrl = new URL(configuredSiteUrl);
  } catch {
    throw new Error('SITE_URL must be an HTTPS origin without a path, credentials, query, or hash.');
  }

  if (
    parsedSiteUrl.protocol !== 'https:' ||
    !parsedSiteUrl.hostname ||
    parsedSiteUrl.username ||
    parsedSiteUrl.password ||
    parsedSiteUrl.pathname !== '/' ||
    parsedSiteUrl.search ||
    parsedSiteUrl.hash ||
    !/^https:\/\/[^/?#]+\/?$/i.test(configuredSiteUrl)
  ) {
    throw new Error('SITE_URL must be an HTTPS origin without a path, credentials, query, or hash.');
  }

  const siteUrl = `${parsedSiteUrl.origin}/`;
  const siteMetadata: Plugin = {
    name: 'cosmic-site-metadata',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', siteUrl);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}</loc>\n  </url>\n</urlset>\n`,
      });
    },
  };

  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [react(), siteMetadata],
  };
});
