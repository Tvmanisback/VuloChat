// Where Supabase sends people after they click an email link. Production uses the
// GitHub Pages site. In local development it uses the dev server, so links open on
// your machine. Both URLs must be listed under Authentication > URL Configuration >
// Redirect URLs in the Supabase dashboard.
export const SITE_URL = import.meta.env.DEV
  ? `${window.location.origin}/`
  : 'https://tvmanisback.github.io/VuloChat/';

export const CONFIRM_URL = `${SITE_URL}confirm.html`;
