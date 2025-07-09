# Customizations

## Custom events + queries (sample walkthroughs)
    - non-real-time
    - real-time

## Custom ETL

### (Optional) Iceberg Parameter Setup

If the data lake is configured with Apache Iceberg, Glue configuration parameters need to be specified to enable Apache Iceberg for Spark jobs. These can be specified under default parameters

- Create a new parameter with the key `--datalake-formats`. Set the value to be `iceberg`.

- Create a new parameter with the key `--enable-glue-datacatalog`. Set the value to be `true`.

- Create a new parameter with the key `--conf`. Set the value to be `spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://<ANALYTICS_S3_BUCKET_NAME>/ --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO`. 
    - Replace `<ANALYTICS_S3_BUCKET_NAME>` with the name of the created S3 bucket for analytics.

You can view more on setting up Iceberg with Glue jobs [here](https://docs.aws.amazon.com/glue/latest/dg/aws-glue-programming-etl-format-iceberg.html).

## Modifying schema

## Modifying/extending architecture
- Allow both Redshift and non-redshift

## Modifying dashboards (ops and analytics)

### Configuring Access to OpenSearch UI 

IAM Access or SSO

### Creating Visualizations and Dashboards with OpenSearch

TSVB

## NOTE: operating (metrics, etc)

## (TODO: Send from game engines)

Utilize the integrated HTTP libraries in your game engine to form and send requests to the [Send Events API](./references/api-reference.md#post---send-events).

- [Unreal Engine 5](https://dev.epicgames.com/community/learning/tutorials/ZdXD/call-rest-api-using-http-json-from-ue5-c)

- [Unity](https://docs.unity3d.com/6000.1/Documentation/Manual/web-request.html)

- [Godot](https://docs.godotengine.org/en/stable/classes/class_httprequest.html)
