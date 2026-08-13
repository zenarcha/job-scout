// CLI: send notifications.
//   npm run notify
// One message per qualifying job — D-58 removed the instant/digest split, so there
// is no longer a --digest mode.
import { notifyNew } from '../services/notify/notify.js';

notifyNew()
  .then((r) => console.log('Notify:', r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
