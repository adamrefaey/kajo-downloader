type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

function minLevel(): LogLevel {
    const raw = process.env.KAJO_MAIN_LOG_LEVEL?.trim().toLowerCase();
    if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
        return raw;
    }
    return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

function emit(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[minLevel()]) {
        return;
    }
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...extra
    });
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export const mainLog = {
    debug: (msg: string, extra?: Record<string, unknown>): void => emit('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>): void => emit('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>): void => emit('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>): void => emit('error', msg, extra)
};
