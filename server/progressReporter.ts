/**
 * 进度反馈优化模块
 * 提供细致的进度报告，让用户了解回测的实时进度
 */

interface ProgressEvent {
  timestamp: Date;
  stage: string;
  progress: number; // 0-100
  message: string;
  details?: Record<string, any>;
}

const progressHistory = new Map<number, ProgressEvent[]>();

/**
 * 记录进度事件
 */
export function reportProgress(
  sessionId: number,
  stage: string,
  progress: number,
  message: string,
  details?: Record<string, any>
): void {
  const event: ProgressEvent = {
    timestamp: new Date(),
    stage,
    progress: Math.min(100, Math.max(0, progress)),
    message,
    details,
  };

  if (!progressHistory.has(sessionId)) {
    progressHistory.set(sessionId, []);
  }

  progressHistory.get(sessionId)!.push(event);

  console.log(
    `[Progress] Session ${sessionId} - ${stage}: ${progress}% - ${message}`
  );
}

/**
 * 获取进度历史
 */
export function getProgressHistory(sessionId: number): ProgressEvent[] {
  return progressHistory.get(sessionId) || [];
}

/**
 * 获取最新进度
 */
export function getLatestProgress(sessionId: number): ProgressEvent | null {
  const history = progressHistory.get(sessionId);
  return history && history.length > 0 ? history[history.length - 1] : null;
}

/**
 * 清空进度历史
 */
export function clearProgressHistory(sessionId: number): void {
  progressHistory.delete(sessionId);
}

/**
 * 进度阶段定义
 */
export const ProgressStages = {
  // 数据获取阶段
  FETCHING_DATA: "fetching_data",
  FETCHING_STOCK_LIST: "fetching_stock_list",
  FETCHING_CANDLES: "fetching_candles",
  FETCHING_COMPLETE: "fetching_complete",

  // 回测执行阶段
  BACKTEST_START: "backtest_start",
  BACKTEST_PROCESSING: "backtest_processing",
  BACKTEST_COMPLETE: "backtest_complete",

  // 结果计算阶段
  CALCULATING_METRICS: "calculating_metrics",
  CALCULATING_COMPLETE: "calculating_complete",

  // 错误阶段
  ERROR: "error",
};

/**
 * 进度计算辅助函数
 */
export class ProgressCalculator {
  private totalSteps: number;
  private currentStep: number;

  constructor(totalSteps: number) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
  }

  /**
   * 获取当前进度百分比
   */
  getProgress(): number {
    if (this.totalSteps === 0) return 0;
    return Math.round((this.currentStep / this.totalSteps) * 100);
  }

  /**
   * 增加步骤
   */
  step(): void {
    this.currentStep++;
  }

  /**
   * 增加多个步骤
   */
  steps(count: number): void {
    this.currentStep += count;
  }

  /**
   * 重置
   */
  reset(): void {
    this.currentStep = 0;
  }

  /**
   * 设置总步数
   */
  setTotalSteps(total: number): void {
    this.totalSteps = total;
  }
}

/**
 * 进度跟踪器
 */
export class ProgressTracker {
  private sessionId: number;
  private calculator: ProgressCalculator;

  constructor(sessionId: number, totalSteps: number) {
    this.sessionId = sessionId;
    this.calculator = new ProgressCalculator(totalSteps);
  }

  /**
   * 报告进度
   */
  report(stage: string, message: string, details?: Record<string, any>): void {
    reportProgress(
      this.sessionId,
      stage,
      this.calculator.getProgress(),
      message,
      details
    );
  }

  /**
   * 增加一步
   */
  step(stage: string, message: string, details?: Record<string, any>): void {
    this.calculator.step();
    this.report(stage, message, details);
  }

  /**
   * 增加多步
   */
  steps(
    count: number,
    stage: string,
    message: string,
    details?: Record<string, any>
  ): void {
    this.calculator.steps(count);
    this.report(stage, message, details);
  }

  /**
   * 完成
   */
  complete(stage: string, message: string, details?: Record<string, any>): void {
    reportProgress(this.sessionId, stage, 100, message, details);
  }

  /**
   * 错误
   */
  error(message: string, details?: Record<string, any>): void {
    reportProgress(
      this.sessionId,
      ProgressStages.ERROR,
      this.calculator.getProgress(),
      message,
      details
    );
  }
}
