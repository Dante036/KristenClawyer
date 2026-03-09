#!/usr/bin/env node
const prompt = process.argv[2] || '';
if (/username/i.test(prompt)) {
  process.stdout.write(process.env.WECHAT_SYNC_GIT_USERNAME || 'x-access-token');
} else {
  process.stdout.write(process.env.WECHAT_SYNC_GIT_PASSWORD || '');
}
