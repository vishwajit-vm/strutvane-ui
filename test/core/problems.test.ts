// Problems from untrusted responses: malformed bodies never crash and never leak internals.
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { defaultMessages } from '../../src/core/messages.ts'
import {
  ApiProblemError,
  isApiProblemError,
  isProblem,
  NETWORK_ERROR_CODE,
  networkProblem,
  problemBannerText,
  problemFromResponse,
  problemIssues,
  sanitizeProblem,
  syntheticProblem,
} from '../../src/core/problems.ts'

const valid = {
  type: 'about:blank',
  title: 'Validation failed',
  status: 422,
  code: 'VALIDATION_FAILED',
}

const response = (body: string, status: number, statusText = '') =>
  new Response(body, {
    status,
    statusText,
    headers: { 'content-type': 'application/problem+json' },
  })

describe('sanitizeProblem', () => {
  test('keeps well-formed members, drops mistyped optional members and malformed issues', () => {
    const p = sanitizeProblem({
      ...valid,
      detail: 'd',
      instance: 7,
      traceId: 't',
      secret: 'internal',
      issues: [
        {
          path: ['lines', 1, 'amount'],
          code: 'too_small',
          message: 'm',
          params: { min: 0, bad: {}, nan: Number.NaN },
        },
        { path: 'lines', code: 'x', message: 'm' },
        { path: ['a', -1], code: 'x', message: 'm' },
        { path: ['a', 1.5], code: 'x', message: 'm' },
        { path: [{}], code: 'x', message: 'm' },
        { path: [], code: 1, message: 'm' },
        { path: [], code: 'x' },
        null,
        'oops',
      ],
    })
    expect(p).toEqual({
      ...valid,
      detail: 'd',
      traceId: 't',
      issues: [
        { path: ['lines', 1, 'amount'], code: 'too_small', message: 'm', params: { min: 0 } },
      ],
    })
  })

  test('rejects non-problems', () => {
    expect(sanitizeProblem(null)).toBeUndefined()
    expect(sanitizeProblem([])).toBeUndefined()
    expect(sanitizeProblem({ ...valid, status: '422' })).toBeUndefined()
    expect(sanitizeProblem({ ...valid, status: 422.5 })).toBeUndefined()
    expect(sanitizeProblem({ title: 'x', status: 500, code: 'X' })).toBeUndefined()
    expect(isProblem({ ...valid, code: undefined })).toBe(false)
  })

  test('property: never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (a, issues) => {
        const value =
          typeof a === 'object' && a !== null && !Array.isArray(a) ? { ...valid, ...a, issues } : a
        const p = sanitizeProblem(value)
        if (p) for (const i of problemIssues(p)) expect(typeof i.message).toBe('string')
      }),
      { numRuns: 500 },
    )
  })
})

describe('problemFromResponse', () => {
  test('a problem body is parsed and sanitized', async () => {
    const p = await problemFromResponse(response(JSON.stringify({ ...valid, issues: 'nope' }), 422))
    expect(p).toEqual({ ...valid })
  })

  test.each([
    ['<html>502 Bad Gateway</html>', 502, 'INTERNAL_ERROR', 502],
    ['', 401, 'UNAUTHENTICATED', 401],
    ['{"error":"x"}', 403, 'FORBIDDEN', 403],
    ['null', 404, 'NOT_FOUND', 404],
    ['[]', 409, 'CONFLICT', 409],
    ['{', 413, 'PAYLOAD_TOO_LARGE', 413],
    ['', 429, 'RATE_LIMITED', 429],
    ['', 503, 'SERVICE_UNAVAILABLE', 503],
    ['', 418, 'INTERNAL_ERROR', 418],
    ['', 400, 'VALIDATION_FAILED', 400],
  ])('%j with %i → %s', async (body, status, code, expectedStatus) => {
    const p = await problemFromResponse(response(body, status, 'Status Text'))
    expect(p).toMatchObject({ code, status: expectedStatus, title: 'Status Text' })
  })

  test('an unreadable body falls back to the status', async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('reset'))
        },
      }),
      { status: 500 },
    )
    expect(await problemFromResponse(broken)).toMatchObject({
      code: 'INTERNAL_ERROR',
      title: 'Request failed',
    })
  })

  test('synthetic problems clamp odd statuses and long titles', () => {
    expect(syntheticProblem(302).status).toBe(500)
    expect(syntheticProblem(500, 'x'.repeat(300)).title).toBe('Request failed')
    expect(networkProblem()).toMatchObject({ status: 0, code: NETWORK_ERROR_CODE })
  })
})

describe('problemBannerText', () => {
  const banner = (p: Parameters<typeof problemBannerText>[0]) =>
    problemBannerText(p, defaultMessages)

  test('5xx never shows internals but does show the support reference', () => {
    expect(
      banner({
        type: 't',
        title: 'Internal',
        status: 500,
        code: 'INTERNAL_ERROR',
        detail: 'NullPointer at db.ts:42',
        traceId: 'abc',
      }),
    ).toBe('Something went wrong on our side. Your changes are kept. Reference: abc.')
    expect(banner({ type: 't', title: 'Internal', status: 500, code: 'INTERNAL_ERROR' })).toBe(
      'Something went wrong on our side. Your changes are kept.',
    )
  })

  test('503, offline, 4xx detail, 4xx catalog by code, title fallback', () => {
    expect(
      banner({ type: 't', title: 'x', status: 503, code: 'SERVICE_UNAVAILABLE', traceId: 'r' }),
    ).toBe(
      'The service is temporarily unavailable. Your changes are kept; please try again shortly. Reference: r.',
    )
    expect(banner(networkProblem())).toContain('You appear to be offline.')
    expect(
      banner({
        type: 't',
        title: 'Conflict',
        status: 409,
        code: 'CONFLICT',
        detail: 'Already paid.',
      }),
    ).toBe('Already paid.')
    expect(banner({ type: 't', title: 'Forbidden', status: 403, code: 'FORBIDDEN' })).toBe(
      'You do not have permission to do this.',
    )
    expect(banner({ type: 't', title: 'Teapot', status: 418, code: 'TEAPOT' })).toBe('Teapot')
    expect(banner({ type: 't', title: 'Weird', status: 302, code: 'X', detail: 'internal' })).toBe(
      'Something went wrong on our side. Your changes are kept.',
    )
  })

  test('the locale and catalog overrides apply', () => {
    expect(
      problemBannerText(
        { type: 't', title: 'x', status: 404, code: 'NOT_FOUND' },
        {
          ...defaultMessages,
          'ui.problem.code.NOT_FOUND': 'Gone.',
        },
      ),
    ).toBe('Gone.')
  })
})

describe('ApiProblemError', () => {
  test('carries the problem; recognised across bundle copies by shape', () => {
    const e = new ApiProblemError({ ...valid, detail: 'Fix it' }, { cause: 'x' })
    expect(e.message).toBe('Fix it')
    expect(e.cause).toBe('x')
    expect(isApiProblemError(e)).toBe(true)
    const foreign = Object.assign(new Error('x'), { name: 'ApiProblemError', problem: valid })
    expect(isApiProblemError(foreign)).toBe(true)
    expect(isApiProblemError(Object.assign(new Error('x'), { name: 'ApiProblemError' }))).toBe(
      false,
    )
    expect(isApiProblemError(new Error('x'))).toBe(false)
    expect(isApiProblemError(valid)).toBe(false)
    expect(new ApiProblemError(valid).message).toBe('Validation failed')
  })
})
