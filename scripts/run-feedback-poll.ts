// CLI: pull 👍/👎 taps back out of Telegram and store them in job_feedback.
//   npm run feedback:poll
// Safe to re-run — the getUpdates offset is persisted in app_config, so consumed
// updates are never processed twice.
import { pollFeedback } from '../lib/feedback.js';

pollFeedback()
  .then((r) => console.log('Feedback poll:', r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
