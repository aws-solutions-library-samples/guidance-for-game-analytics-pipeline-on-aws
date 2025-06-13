# Upgrading Guidance for Game Analytics Pipeline to Version 3

This implementation guide outlines the steps required to migrate from V2 to V3 of the Game Analytics Pipeline on AWS, with a specific focus on the data migration from Parquet to Apache Iceberg format.

## Table of Contents

1. Overview
2. Key Differences Between V2 and V3
3. Prerequisites
4. Data Migration Considerations: Parquet to Iceberg
5. Migration Steps
6. Post-Migration Validation
7. Troubleshooting 

## Overview

The Game Analytics Pipeline on AWS has evolved from V2 to V3, with one of the most significant changes being the migration from Parquet to Apache Iceberg as the data storage format. This guide provides a comprehensive approach to implementing this migration while ensuring data integrity and minimal disruption to analytics workflows.

## Key Differences Between V2 and V3

### What is Apache Iceberg?

Apache Iceberg is an Open Table Format (OTF) for large analytic datasets that provides significant advantages over traditional file formats like Parquet when used alone. It maintains tables through metadata that tracks 
all data files within a table, enabling schema evolution, hidden partitioning, time travel capabilities, and ACID transactions. Unlike traditional Hive-style partitioning, Iceberg uses a high-performance format that handles partition evolution and complex types while supporting full SQL queries. It was designed to solve performance and reliability issues in large tables, offering improved query planning, reliable writes with atomic commits, and concurrent reads during writes. Iceberg works with various processing engines including Spark, Trino, PrestoDB, Flink, and Hive, making it a versatile choice for modern data lake architectures. Its ability to provide snapshot isolation, schema evolution without table rewrites, and partition evolution without data migration makes it particularly valuable for organizations managing large-scale analytics workloads that require both flexibility and performance.

### Features

* Schema evolution
* Hidden partitioning
* Time travel capabilities
* ACID transactions
* Improved query performance
* Compatibility with various processing engines

| Feature | V2 (Parquet) | V3 (Iceberg) |
|---------|---------------|---------------|
| Data Format | Parquet files | Apache Iceberg (Iceberg managed parquet using Amazon S3 as underlying storage) |
| Schema Evolution | Limited, requires table recreation and schema validations | Seamless schema evolution |
| Time Travel | Not supported | Supported (query data at specific points in time) |
| Transactions | Not supported | Supported |
| Partitioning | Explicit partitioning | Hidden partitioning |
| Query Performance | Good | Improved with metadata and partitioning pruning |
| Configuration | Simple | Requires iceberg-specific settings |
| AWS Glue Integration | Native | Requires Glue 3.0+ |
| Amazon Data Firehose | Native | Native |

## Prerequisites

Before beginning the migration, ensure you have:

### Knowledge Requirements

* Familiarity with AWS services and GAP v2
* Basic understanding of data lake concepts
* Understanding of Apache Iceberg principles

### Backup

Full backup of existing Parquet data: You can replicate your data or fully copy the Amazon S3 bucket in order to assure that your existing data is secure and can be recovered for roll-back purposes.

## Migration Steps

Data Backup for existing events from V2 using AWS CLI for Amazon S3 to Amazon S3 Copy

This is the most straightforward approach for a one-time backup but feel free to use any back strategy you have implemented:

```
# Sync all Parquet files from source to backup mantaining the entire data structure 
aws s3 sync s3://source-analytics-bucket/ s3://backup-bucket/parquet-backup/
```

Prepare the Environment and Update Configuration. 

For migration purposes is required to have both versions installed during the migration from parquet to iceberg. Follow the deployment instructions in the manual (link). You have to enable Iceberg support in the configuration by setting `ENABLE_APACHE_ICEBERG_SUPPORT: true` in your configuration file.

```
ENABLE_APACHE_ICEBERG_SUPPORT: true,
```

Data Migration: Parquet to Iceberg

There are two easy ways to migrate your data depending on the current AWS Analytics services stack you are using:

### Amazon Athena

```
INSERT INTO {name_space}.{v3_table} SELECT * FROM {name_space}.v2_table
```

You can use the same for Apache Iceberg table:

```
INSERT INTO {name_space}.{v3_iceberg_table}
SELECT event_id, event_type, event_name, event_version, event_timestamp, app_version, application_id, application_name, event_data, metadata 
FROM {name_space}.{v3_table}
```

### AWS Glue

The migration from Parquet to Iceberg involves converting existing data and updating table definitions. The V2 pipeline includes a Glue job (`convert_game_events_to_iceberg.py`) specifically for this purpose.

1. Data Migration Process:
    1. Create Iceberg Tables**: The CDK deployment will create new Iceberg tables in the AWS Glue Data Catalog.
    2. Run the Conversion Job**: Execute the Glue job to convert existing Parquet data to Iceberg format pointing to recently created tables.

2. Key Considerations During Migration:
    1. Partitioning: Apache Iceberg uses hidden partitioning and represents a significant shift from traditional Hive-style partitioning that you might be familiar with in Parquet-based data lakes. When you migrate to Iceberg, one of the most noticeable changes is that you will no longer see the explicit partition folders in your amazon S3 bucket structure. Read more [here](https://iceberg.apache.org/docs/1.4.0/partitioning/)
        1. V2 (Parquet)**: Explicit partitioning by, `year`, `month`, `day`
        2. V3 (Iceberg)**: Hidden partitioning managed by Iceberg, for improved query performance
    2. Schema Handling: Apache Iceberg handles schema evolution differently than Parquet. The migration process preserves the schema but the date column is not required for partitioning anymore. Read more [here](https://iceberg.apache.org/docs/latest/evolution/#partition-evolution)
3. Rollback Plan:
    1. If issues arise during migration, follow these rollback steps:
        1. Revert to Parquet Tables**:
        2. Update application configurations to use original Parquet tables
2. Validate data access and integrity

## Post-Migration Data Validation

You can create a post-migration validation framework that includes the following key verification methods but not limited to include your own validations: 

 * Record Count Validation: Compares the total number of records between source and target systems to ensure completeness.
 * Data Integrity Checks: Examine critical columns for null values and identify duplicate records that might indicate migration issues.
 * Data Consistency Validation: Compares aggregate values like sums, minimums, maximums, and averages to verify computational accuracy.
 * Sample Record Comparison: Inspects specific records by their identifiers to confirm detailed data fidelity.
 * Data Distribution Check: Analyzes the frequency distribution of categorical data to ensure proportional representation was maintained.
 * Schema Validation: Confirms that column names, data types, and structural elements were correctly transferred.
 * Reconciliation Reports: summarize the validation results including success rates, failed records, data quality, metrics, and performance statistics to provide stakeholders with a comprehensive view of migration success.

### Record Count Validation
```
sql
-- Parquet table count
SELECT COUNT(*) AS parquet_count FROM "database"."parquet_table";

-- Iceberg table count
SELECT COUNT(*) AS iceberg_count FROM "database"."iceberg_table";
```

### Data Integrity Checks
```
sql
-- Check nulls in Parquet table
SELECT 
  SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END) AS null_id,
  SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS null_customer_id,
  SUM(CASE WHEN transaction_date IS NULL THEN 1 ELSE 0 END) AS null_transaction_date
FROM "database"."parquet_table";

-- Check nulls in Iceberg table
SELECT 
  SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END) AS null_id,
  SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS null_customer_id,
  SUM(CASE WHEN transaction_date IS NULL THEN 1 ELSE 0 END) AS null_transaction_date
FROM "database"."iceberg_table";
```

### Data Consistency Validation
```
sql
-- Parquet metrics
SELECT 
  SUM(amount) AS sum_amount,
  MIN(amount) AS min_amount,
  MAX(amount) AS max_amount,
  AVG(amount) AS avg_amount,
  COUNT(DISTINCT customer_id) AS distinct_customers
FROM "database"."parquet_table";

-- Iceberg metrics
SELECT 
  SUM(amount) AS sum_amount,
  MIN(amount) AS min_amount,
  MAX(amount) AS max_amount,
  AVG(amount) AS avg_amount,
  COUNT(DISTINCT customer_id) AS distinct_customers
FROM "database"."iceberg_table";
```

### Sample Record Comparison
```
sql
-- Sample from Parquet
SELECT * 
FROM "database"."parquet_table"
WHERE id IN ('12345', '67890', '24680', '13579', '97531')
ORDER BY id;

-- Sample from Iceberg
SELECT * 
FROM "database"."iceberg_table"
WHERE id IN ('12345', '67890', '24680', '13579', '97531')
ORDER BY id;
```

### Data Distribution Check
```
sql
-- Parquet distribution
SELECT 
  status,
  COUNT(*) AS record_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "database"."parquet_table"), 2) AS percentage
FROM "database"."parquet_table"
GROUP BY status
ORDER BY COUNT(*) DESC;

-- Iceberg distribution
SELECT 
  status,
  COUNT(*) AS record_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "database"."iceberg_table"), 2) AS percentage
FROM "database"."iceberg_table"
GROUP BY status
ORDER BY COUNT(*) DESC;
```

### Schema Validation
```
sql
-- Parquet schema
SELECT 
  column_name,
  data_type,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'database' 
AND table_name = 'parquet_table'
ORDER BY ordinal_position;

-- Iceberg schema
SELECT 
  column_name,
  data_type,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'database' 
AND table_name = 'iceberg_table'
ORDER BY ordinal_position;
```
