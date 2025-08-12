## General troubleshooting

### Deployment fails with insufficient permissions for Lake Formation

Issue: This occurs when AWS Lake Formation is enabled on the account. AWS Lake Formation is an access control service to centralize fine-grained access control for data lakes. If this is enabled, the IAM role used to deploy the solution needs to have permissions to create and modify resources.

Solutions:
* If you are using CDK to deploy the stack, after running `npm run deploy.bootstrap` navigate to CloudFormation in the AWS console. Locate the CDKToolkit stack, navigate to the Resources tab of the stack, and locate the resource `CloudFormationExecutionRole`. Grant this IAM role admin priviledges in your Lake Formation console.
* If you are using Hashicorp Terraform to deploy the stack, ensure that the IAM identity configured has admin priviledges in your Lake Formation console.

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

