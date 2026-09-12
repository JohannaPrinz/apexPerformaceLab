/**
 * Public surface of the auth slice.
 *
 * `server/router.ts` is intentionally absent: it is registered once in
 * `src/server/api/root.ts` and imported from nowhere else, which is what keeps
 * the API surface fully described by that single file.
 */
export { ForgotPasswordForm } from './components/forgot-password-form';
export { ResetPasswordForm } from './components/reset-password-form';
export {
  resetRefusal,
  RESET_FAILED,
  RESET_LINK_CLOSED,
  RESET_NOT_SENT,
  RESET_REQUESTED,
} from './reset-messages';
export { SignInForm } from './components/sign-in-form';
export { SignOutButton } from './components/sign-out-button';
export { SignUpForm } from './components/sign-up-form';
export {
  MIN_PASSWORD_LENGTH,
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from './schemas';
