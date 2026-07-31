// CLI: send notifications.
//   npm run notify              # instant High-priority pings
//   npm run notify -- --digest  # batched Med/Low digest
import { notifyNew, sendDigest } from '../services/notify/notify.js';

const digest = process.argv.includes('--digest');

(digest ? sendDigest() : notifyNew())
  .then((r) => console.log(digest ? 'Digest:' : 'Instant notify:', r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
