## General troubleshooting

### Update metadata in the catalogue after you add Compatible partitions or new data

Issue: Data is not showed on Amazon Athena.

Solutions:
* Create an AWS Glue crawler on your data Amazon S3 bucket ```raw data folder```. 
* Run the a ```MSCK REPAIR TABLE``` command on Amazon Athena to update partitions. Read more [here](https://docs.aws.amazon.com/es_es/athena/latest/ug/msck-repair-table.html)


## Migration troubleshooting

### AWS Glue version compatibility

Issue: Glue jobs failing due to version incompatibility.
Solution:

* Ensure using Glue version 3.0 or later
* Add necessary Iceberg libraries to job configuration
* Update job parameters to include Iceberg catalog settings

