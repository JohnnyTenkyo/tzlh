CREATE TABLE `backtest_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`quantity` decimal(16,6) NOT NULL,
	`avgCost` decimal(16,4) NOT NULL,
	`totalCost` decimal(16,2) NOT NULL,
	`entryTimeframe` varchar(20),
	`entryType` enum('first_buy','second_buy') DEFAULT 'first_buy',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backtest_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backtest_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localUserId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`initialBalance` decimal(16,2) NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`marketCapFilter` enum('none','1b','10b','50b','100b','500b') NOT NULL DEFAULT 'none',
	`cdSignalTimeframes` text NOT NULL,
	`cdLookbackBars` int NOT NULL DEFAULT 5,
	`ladderBreakTimeframes` text NOT NULL,
	`finalBalance` decimal(16,2),
	`totalReturn` decimal(10,4),
	`maxDrawdown` decimal(10,4),
	`totalTrades` int DEFAULT 0,
	`winTrades` int DEFAULT 0,
	`lossTrades` int DEFAULT 0,
	`benchmarkQQQReturn` decimal(10,4),
	`benchmarkSPYReturn` decimal(10,4),
	`progress` int DEFAULT 0,
	`currentDate` varchar(10),
	`equityCurve` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `backtest_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backtest_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`type` enum('buy','sell') NOT NULL,
	`quantity` decimal(16,6) NOT NULL,
	`price` decimal(16,4) NOT NULL,
	`amount` decimal(16,2) NOT NULL,
	`tradeDate` varchar(10) NOT NULL,
	`signalTimeframe` varchar(20),
	`signalType` varchar(64),
	`reason` text,
	`pnl` decimal(16,2),
	`pnlPercent` decimal(10,4),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backtest_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(256) NOT NULL,
	`name` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignedIn` timestamp DEFAULT (now()),
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `stock_recommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`date` varchar(10) NOT NULL,
	`totalScore` decimal(8,2) NOT NULL,
	`matchLevel` varchar(20) DEFAULT '4h',
	`cdSignalLevels` text,
	`ladderBreakLevel` varchar(20),
	`price` decimal(16,4),
	`changePercent` decimal(10,4),
	`reason` text,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_recommendations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `backtest_positions` ADD CONSTRAINT `backtest_positions_sessionId_backtest_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `backtest_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD CONSTRAINT `backtest_sessions_localUserId_local_users_id_fk` FOREIGN KEY (`localUserId`) REFERENCES `local_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backtest_trades` ADD CONSTRAINT `backtest_trades_sessionId_backtest_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `backtest_sessions`(`id`) ON DELETE cascade ON UPDATE no action;