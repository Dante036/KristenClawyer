#!/usr/bin/env node
const { importWechatArticle } = require('./importer');

function parseArgs(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--url') options.url = argv[++i];
    else if (current === '--tag') options.tag = argv[++i];
    else if (current === '--slug') options.slug = argv[++i];
  }
  return options;
}

(async () => {
  const options = parseArgs(process.argv);
  if (!options.url) {
    console.error('Usage: node tools/wechat-sync/import_wechat_article.js --url "<wechat-url>" [--tag "债务纠纷"] [--slug "custom-slug"]');
    process.exit(1);
  }

  const result = await importWechatArticle(options);
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
