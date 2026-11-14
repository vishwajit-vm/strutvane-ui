/**
 * `<SignIn>`: the email + password screen of the app shell (`POST {api}/auth/sign-in`).
 *
 * - Labelled inputs with `autocomplete` hints (password managers work), a real `<form>` so Enter
 *   submits, and one polite live region for the outcome.
 * - Failures come from the server's problem: wrong credentials (401) are one message for unknown
 *   emails and wrong passwords alike; 429 shows the `Retry-After` wait; anything else the standard
 *   banner (5xx details are never shown). The password field is cleared after a failure.
 *
 * @module
 */
import { type FormEvent, type ReactElement, useId, useState } from 'react'
import type { MessageCatalog } from '../core/messages.ts'
import { formatMessage } from '../core/messages.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import type { SessionActor, SessionClient } from '../core/session-client.ts'

/** Props of {@link SignIn}. */
export interface SignInProps {
  readonly session: SessionClient
  readonly appName: string
  readonly messages: MessageCatalog
  readonly locale?: string
  /** A notice above the form (e.g. "your session has ended"). */
  readonly notice?: string
  readonly onSignedIn: (actor: SessionActor) => void
}

/** The sign-in screen. */
export function SignIn(props: SignInProps): ReactElement {
  const locale = props.locale ?? 'en'
  const t = (key: string, params: Record<string, string | number> = {}) =>
    formatMessage(props.messages, key, params, locale)
  const id = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
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
      setBusy(false)
    }
  }

  return (
    <main className="sv-signin" id="sv-main">
      <form onSubmit={(e) => void submit(e)} aria-labelledby={`${id}-title`} noValidate>
        <h1 id={`${id}-title`}>{t('ui.app.signInTitle', { app: props.appName })}</h1>
        {props.notice ? <p role="status">{props.notice}</p> : null}
        <label htmlFor={`${id}-email`}>{t('ui.app.email')}</label>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <label htmlFor={`${id}-password`}>{t('ui.app.password')}</label>
        <input
          id={`${id}-password`}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <p role="alert" aria-live="assertive" className="sv-error">
          {error ?? ''}
        </p>
        <button type="submit" disabled={busy || email === '' || password === ''}>
          {busy ? t('ui.app.signingIn') : t('ui.app.signIn')}
        </button>
      </form>
    </main>
  )
}
