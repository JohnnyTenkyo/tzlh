CREATE TABLE `data_source_health` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(32) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`success` int NOT NULL DEFAULT 0,
	`failure` int NOT NULL DEFAULT 0,
	`lastSuccess` timestamp,
	`lastFailure` timestamp,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `data_source_health_id` PRIMARY KEY(`id`)
);
