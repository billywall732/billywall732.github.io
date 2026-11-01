// The cover: keeps the "Contact" button pointed at the email in js/projects.js.
// The page's own mailto link works without JavaScript; this follows any change there.
import { contact } from './projects.js';

if (contact.email) document.querySelector('.say-hello').href = `mailto:${contact.email}`;
