import { parse, ParseError } from '@joe-re/sql-parser'
import log4js from 'log4js'
import { PublishDiagnosticsParams, Diagnostic } from 'vscode-languageserver'
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import { lint, ErrorLevel, LintResult, RawConfig } from 'sqlint'
import cache, { LintCache } from './cache'

const logger = log4js.getLogger()

function doLint(
  uri: string,
  sql: string,
  config?: RawConfig | null
): Diagnostic[] {
  if (!sql) {
    return []
  }
  const result: LintResult[] = JSON.parse(
    lint({
      configPath: process.cwd(),
      formatType: 'json',
      text: sql,
      configObject: config,
    })
  )
  const lintDiagnostics = result.map((v) => v.diagnostics).flat()
  const lintCache: LintCache[] = []
  const diagnostics = lintDiagnostics.map((v) => {
    const diagnostic = {
      range: {
        start: {
          line: v.location.start.line - 1,
          character: v.location.start.column - 1,
        },
        end: {
          line: v.location.end.line - 1,
          character: v.location.end.column - 1,
        },
      },
      message: v.message,
      severity:
        v.errorLevel === ErrorLevel.Error
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      source: 'sql',
      relatedInformation: [],
    }
    lintCache.push({ diagnostic, lint: v })
    return diagnostic
  })
  cache.setLintCache(uri, lintCache)
  return diagnostics
}

export default function createDiagnostics(
  uri: string,
  sql: string,
  config?: RawConfig | null
): PublishDiagnosticsParams {
  logger.debug(`createDiagnostics`)
  let diagnostics: Diagnostic[] = []
  try {
    const ast = parse(sql)
    logger.debug(`ast: ${JSON.stringify(ast)}`)
    diagnostics = doLint(uri, sql, config)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    logger.debug('parse error')
    logger.debug(e)
    cache.setLintCache(uri, [])
    if (err.name !== 'SyntaxError') {
      throw e
    }
    const pe = e as ParseError
    diagnostics.push({
      range: {
        start: {
          line: pe.location.start.line - 1,
          character: pe.location.start.column,
        },
        end: {
          line: pe.location.end.line - 1,
          character: pe.location.end.column,
        },
      },
      message: pe.message,
      severity: DiagnosticSeverity.Error,
      // code: number | string,
      source: 'sql',
      relatedInformation: [],
    })
  }
  logger.debug(`diagnostics: ${JSON.stringify(diagnostics)}`)
  return { uri: uri, diagnostics }
}
