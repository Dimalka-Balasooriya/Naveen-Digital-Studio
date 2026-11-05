import { Phone } from 'lucide-react';
import { phoneHref } from '../utils/phone';

export default function CallNowButton({ phone }) {
  const href = phoneHref(phone);
  const className = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-700';
  const content = <><Phone size={16} aria-hidden="true" />Call Now</>;
  return href
    ? <a href={href} className={className} aria-label={`Call Now: ${phone}`} title="Open your phone app, then confirm the call there">{content}</a>
    : <button type="button" disabled className={className} title="A valid customer phone number is required">{content}</button>;
}
