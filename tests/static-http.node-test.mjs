import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.COSMIC_HTTP_BASE_URL ?? 'http://127.0.0.1:8080';

async function request(path, method = 'GET', headers) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\b(?:name|property)="${key}")[^>]*>`, 'i'))?.[0];
  return tag?.match(/\bcontent="([^"]*)"/i)?.[1];
}

test('static HTTP integration', { timeout: 60_000 }, async (t) => {
  let scriptPath;
  let stylesheetPath;
  let canonicalUrl;
  let socialImagePath;

  await t.test('GET / serves the application shell and static asset references', async () => {
    const response = await request('/');
    const html = response.body.toString('utf8');

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
    const pageTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    assert.ok(pageTitle);
    assert.match(pageTitle, /Cosmic Journey By Luke/);
    assert.match(html, /<div id="root"><\/div>/);
    assert.doesNotMatch(html, /__SITE_URL__/);

    const rootEnd = html.indexOf('</div>');
    const staticInfoStart = html.indexOf('<section class="site-info"', rootEnd);
    assert.ok(rootEnd >= 0 && staticInfoStart > rootEnd);

    const description = metaContent(html, 'description');
    assert.ok(description);
    assert.match(metaContent(html, 'robots') ?? '', /index, follow, max-image-preview:large/);
    assert.equal(metaContent(html, 'og:type'), 'website');
    assert.equal(metaContent(html, 'og:title'), pageTitle);
    assert.equal(metaContent(html, 'og:description'), description);
    assert.equal(metaContent(html, 'og:site_name'), 'Cosmic Journey By Luke');
    assert.equal(metaContent(html, 'og:locale'), 'en_US');
    assert.equal(metaContent(html, 'og:image:width'), '1265');
    assert.equal(metaContent(html, 'og:image:height'), '1470');
    assert.ok(metaContent(html, 'og:image:alt'));
    assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image');
    assert.equal(metaContent(html, 'twitter:title'), metaContent(html, 'og:title'));
    assert.equal(metaContent(html, 'twitter:description'), description);
    assert.equal(metaContent(html, 'twitter:image:alt'), metaContent(html, 'og:image:alt'));

    const canonicalTags = [...html.matchAll(/<link\b(?=[^>]*\brel="canonical")[^>]*>/gi)];
    assert.equal(canonicalTags.length, 1);
    const canonicalHref = canonicalTags[0][0].match(/\bhref="([^"]+)"/)?.[1];
    assert.ok(canonicalHref);
    canonicalUrl = new URL(canonicalHref);
    assert.equal(canonicalUrl.protocol, 'https:');
    assert.equal(canonicalUrl.pathname, '/');
    assert.equal(canonicalUrl.search, '');
    assert.equal(canonicalUrl.hash, '');
    assert.equal(metaContent(html, 'og:url'), canonicalUrl.href);
    const socialImageUrl = new URL(metaContent(html, 'og:image'));
    assert.equal(socialImageUrl.origin, canonicalUrl.origin);
    assert.equal(socialImageUrl.pathname, '/social-preview.jpg');
    assert.equal(metaContent(html, 'twitter:image'), socialImageUrl.href);
    socialImagePath = socialImageUrl.pathname;

    const jsonLdText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
    assert.ok(jsonLdText);
    const structuredData = JSON.parse(jsonLdText);
    assert.equal(structuredData['@context'], 'https://schema.org');
    const graph = structuredData['@graph'];
    const website = graph.find((item) => item['@type'] === 'WebSite');
    const application = graph.find((item) => item['@type'] === 'WebApplication');
    assert.ok(website);
    assert.ok(application);
    assert.equal(website.url, canonicalUrl.href);
    assert.deepEqual(website.inLanguage, ['en', 'pl']);
    assert.equal(application.url, canonicalUrl.href);
    assert.equal(application.applicationCategory, 'MultimediaApplication');
    assert.deepEqual(application.inLanguage, ['en', 'pl']);

    const moduleScript = html.match(/<script\b(?=[^>]*\btype="module")[^>]*>/)?.[0];
    const stylesheetLink = html.match(/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/)?.[0];
    scriptPath = moduleScript?.match(/\bsrc="([^"]+\.js)"/)?.[1];
    stylesheetPath = stylesheetLink?.match(/\bhref="([^"]+\.css)"/)?.[1];
    assert.ok(scriptPath);
    assert.ok(stylesheetPath);
  });

  await t.test('robots and sitemap publish the same canonical origin', async () => {
    assert.ok(canonicalUrl);
    const [robots, sitemap] = await Promise.all([
      request('/robots.txt'),
      request('/sitemap.xml'),
    ]);

    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type') ?? '', /text\/plain/i);
    assert.equal(
      robots.body.toString('utf8'),
      `User-agent: *\nAllow: /\nSitemap: ${canonicalUrl.origin}/sitemap.xml\n`,
    );

    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get('content-type') ?? '', /(?:application|text)\/xml/i);
    const locations = [...sitemap.body.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(locations, [canonicalUrl.href]);
  });

  await t.test('social preview image is served as the expected JPEG', async () => {
    assert.ok(socialImagePath);
    const response = await request(socialImagePath);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /image\/jpeg/i);
    assert.deepEqual([...response.body.subarray(0, 3)], [255, 216, 255]);
  });

  await t.test('HEAD / returns headers without a body', async () => {
    const response = await request('/', 'HEAD');

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
    assert.equal(response.body.length, 0);
  });

  await t.test('referenced JavaScript and CSS are served with the correct MIME types', async () => {
    assert.ok(scriptPath);
    assert.ok(stylesheetPath);
    const [script, stylesheet] = await Promise.all([
      request(scriptPath),
      request(stylesheetPath),
    ]);

    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /(?:javascript|ecmascript)/i);
    assert.ok(script.body.length > 0);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type') ?? '', /text\/css/i);
    assert.ok(stylesheet.body.length > 0);
  });

  await t.test('demo video supports metadata and byte-range requests', async () => {
    const path = '/demo/starfield.mp4';
    const head = await request(path, 'HEAD');
    const contentLength = Number(head.headers.get('content-length'));

    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type') ?? '', /video\/mp4/i);
    assert.ok(contentLength > 0);

    const range = await request(path, 'GET', { Range: 'bytes=0-31' });
    assert.equal(range.status, 206);
    assert.match(range.headers.get('content-type') ?? '', /video\/mp4/i);
    assert.equal(
      range.headers.get('content-range'),
      `bytes 0-31/${contentLength}`,
    );
    assert.equal(range.body.length, 32);
    assert.equal(range.body.toString('ascii', 4, 8), 'ftyp');
  });

  await t.test('missing assets and private project files return 404', async () => {
    for (const path of [
      '/assets/missing.js',
      '/src/main.tsx',
      '/src/App.tsx',
      '/package.json',
      '/package-lock.json',
      '/server.mjs',
      '/.git/HEAD',
      '/.env',
    ]) {
      assert.equal((await request(path)).status, 404, path);
    }
  });

  await t.test('POST / is rejected', async () => {
    const response = await request('/', 'POST');
    assert.ok(response.status >= 400 && response.status < 500, `Unexpected status: ${response.status}`);
  });
});
