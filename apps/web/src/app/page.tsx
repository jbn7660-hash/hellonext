import { redirect } from 'next/navigation';

/**
 * Root page — redirects to /login.
 * Middleware handles role-based routing for authenticated users,
 * but this page ensures a fallback redirect if middleware is bypassed.
 */
export default function RootPage() {
  redirect('/login');
}
