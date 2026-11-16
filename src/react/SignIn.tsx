/**
 * Sign-in: the full screen (`<SignIn>`, in the design's `AuthLayout`) and "sign in again" over the
 * current screen (`<SignInDialog>`), sharing one form (`POST {api}/auth/sign-in`).
 *
 * - Labelled inputs with `autocomplete` hints (password managers work), a real `<form>` so Enter
 *   submits, and one live region for the outcome.
 * - Failures come from the server's problem: wrong credentials (401) are one message for unknown
 *   emails and wrong passwords alike; 429 shows the `Retry-After` wait; anything else the standard
 *   banner (5xx details are never shown). The password field is cleared after a failure.
 * - One attempt at a time: a second submit while the first is in flight is ignored.
 * - The dialog can't be dismissed: the session has ended, and the screen behind it is only kept so
 *   a draft survives. The person can still sign out (go to the full sign-in screen) instead.
 *
 * @module
 */
import { type FormEvent, type ReactElement, type ReactNode, useId, useRef, useState } from 'react'
import { formatMessage, type MessageCatalog } from '../core/messages.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import type { SessionActor, SessionClient } from '../core/session-client.ts'
import { ModalDialog } from './Dialog.tsx'
import { useShellSlots, useSkins } from './design-hooks.ts'

/** Props of {@link SignInForm}. */
export interface SignInFormProps {
  readonly session: SessionClient
  readonly messages: MessageCatalog
  readonly locale?: string
  /** A notice above the fields (e.g. "your session has ended"). */
  readonly notice?: string
  /** Prefill the email (sign in again as the same person). */
  readonly email?: string
  readonly onSignedIn: (actor: SessionActor) => void
  /** Content after the submit button (another action). */
  readonly extra?: ReactNode
}

/** The email + password fields, the submit button and the outcome message. */
export function SignInForm(props: SignInFormProps): ReactElement {
  const { Field, Input, Button, Alert } = useSkins()
  const locale = props.locale ?? 'en'
  const t = (key: string, params: Record<string, string | number> = {}) =>
    formatMessage(props.messages, key, params, locale)
  const id = useId()
  const [email, setEmail] = useState(props.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      props.onSignedIn(await props.session.signIn(email.trim(), password))
    } catch (failure) {
      setPassword('')
      if (isApiProblemError(failure)) {
        const { problem } = failure
        if (problem.status === 401) setError(t('ui.app.invalidCredentials'))
        else if (problem.status === 429) {
          const retry = Number((problem as { retryAfter?: unknown }).retryAfter)
          setError(t('ui.app.tooManyAttempts', { seconds: Number.isFinite(retry) ? retry : 60 }))
        } else setError(problemBannerText(problem, props.messages, locale))
      } else setError(t('ui.problem.network'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate data-sv-part="sign-in">
      {props.notice ? (
        <Alert tone="info" role="status">
          {props.notice}
        </Alert>
      ) : null}
      <Field label={t('ui.app.email')} htmlFor={`${id}-email`} required={false}>
        <Input
          id={`${id}-email`}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Field label={t('ui.app.password')} htmlFor={`${id}-password`} required={false}>
        <Input
          id={`${id}-password`}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <p role="alert" aria-live="assertive" data-sv-part="form-error">
        {error ?? ''}
      </p>
      <Button type="submit" variant="primary" disabled={busy || email === '' || password === ''}>
        {busy ? t('ui.app.signingIn') : t('ui.app.signIn')}
      </Button>
      {props.extra}
    </form>
  )
}

/** Props of {@link SignIn}. */
export interface SignInProps extends Omit<SignInFormProps, 'extra'> {
  readonly appName: string
}

/** The full sign-in screen, in the design's `AuthLayout`. */
export function SignIn(props: SignInProps): ReactElement {
  const { AuthLayout } = useShellSlots()
  const headingId = useId()
  const t = (key: string, params: Record<string, string> = {}) =>
    formatMessage(props.messages, key, params, props.locale ?? 'en')
  return (
    <main id="sv-main" aria-labelledby={headingId}>
      <AuthLayout appName={props.appName}>
        <h1 id={headingId}>{t('ui.app.signInTitle', { app: props.appName })}</h1>
        <SignInForm {...props} />
      </AuthLayout>
    </main>
  )
}

/** Props of {@link SignInDialog}. */
export interface SignInDialogProps extends Omit<SignInFormProps, 'extra' | 'notice'> {
  /** Leave instead: show the full sign-in screen (drafts are lost). */
  readonly onSignOut: () => void
}

/** "Sign in again" over the current screen, so a form keeps its draft (ui audit item 3). */
export function SignInDialog(props: SignInDialogProps): ReactElement {
  const { Button } = useSkins()
  const t = (key: string) => formatMessage(props.messages, key, {}, props.locale ?? 'en')
  return (
    <ModalDialog
      title={t('ui.app.signInAgainTitle')}
      description={t('ui.app.sessionExpired')}
      dismissible={false}
      onClose={() => undefined}
    >
      <SignInForm
        {...props}
        extra={
          <Button variant="ghost" onClick={props.onSignOut}>
            {t('ui.app.signOut')}
          </Button>
        }
      />
    </ModalDialog>
  )
}
