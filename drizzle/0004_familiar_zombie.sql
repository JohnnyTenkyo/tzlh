CREATE TABLE `cache_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`lastUpdated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`status` enum('pending','caching','completed','failed') NOT NULL DEFAULT 'pending',
	`earliestDate` varchar(10),
	`latestDate` varchar(10),
	`totalCandles` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cache_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `cache_metadata_symbol_unique` UNIQUE(`symbol`)
);
--> statement-breakpoint
CREATE TABLE `historical_candle_cache` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`date` varchar(10) NOT NULL,
	`open` decimal(16,4) NOT NULL,
	`high` decimal(16,4) NOT NULL,
	`low` decimal(16,4) NOT NULL,
	`close` decimal(16,4) NOT NULL,
	`volume` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historical_candle_cache_id` PRIMARY KEY(`id`)
);
