import 'server-only';

export type LogLevel = 'info' | 'warn' | 'error';
type LogValue = string | number | boolean | null;
type LogContext = Record<string, LogValue>;

const SENSITIVE_KEY =
  /(password|token|secret|authorization|cookie|credential|connection|string|url|email|ip|body|content)/i;
const SENSITIVE_VALUE =
  /(postgres(?:ql)?:\/\/[^\s]+|bearer\s+[^\s]+|(?:token|secret|password)=\S+)/gi;

function sanitizeValue(value: LogValue): LogValue {
  if (typeof value !== 'string') return value;
  return value.slice(0, 200).replace(SENSITIVE_VALUE, '[REDACTED]');
}

function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;

  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)])
  );
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  const safeContext = sanitizeContext(context);
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(safeContext ? { context: safeContext } : {}),
  };
  const line = JSON.stringify(record);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info(event: string, context?: LogContext) {
    write('info', event, context);
  },
  warn(event: string, context?: LogContext) {
    write('warn', event, context);
  },
  error(event: string, context?: LogContext) {
    write('error', event, context);
  },
};
