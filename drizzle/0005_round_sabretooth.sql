ALTER TABLE `backtest_sessions` ADD `avgReturn` decimal(10,4);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `sharpeRatio` decimal(10,4);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `maxProfit` decimal(16,2);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `maxLoss` decimal(16,2);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `avgProfit` decimal(10,4);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `avgLoss` decimal(10,4);--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `maxConsecutiveWin` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `maxConsecutiveLoss` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `totalFees` decimal(16,2) DEFAULT 0;