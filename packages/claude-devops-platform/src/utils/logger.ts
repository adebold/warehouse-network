import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: keyof typeof LogLevel | LogLevel) {
    if (typeof level === 'string') {
      this.level = LogLevel[level];
    } else {
      this.level = level;
    }
  }

  debug(...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), ...args);
    }
  }

  info(...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue('[INFO]'), ...args);
    }
  }

  warn(...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow('[WARN]'), ...args);
    }
  }

  error(...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(chalk.red('[ERROR]'), ...args);
    }
  }

  success(...args: any[]) {
    console.log(chalk.green('✓'), ...args);
  }

  fail(...args: any[]) {
    console.log(chalk.red('✗'), ...args);
  }
}

export const logger = new Logger();