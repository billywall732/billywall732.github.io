// The cover: just points "Say Hello" at the email in js/projects.js once one is set.
// Until then it opens a GitHub issue, the same as the footer's "Open an issue".
import { contact } from './projects.js';

if (contact.email) document.querySelector('.say-hello').href = `mailto:${contact.email}`;
