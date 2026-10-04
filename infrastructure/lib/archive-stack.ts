import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";

export class ArchiveStack extends cdk.Stack {
  public readonly archiveBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.archiveBucket = new s3.Bucket(this, "ArchiveBucket", {
      bucketName: "restaurant-ops-archive-bucket",
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365 * 2),
            },
          ],
        },
      ],
    });
    new cdk.CfnOutput(this, "ArchiveBucketName", {
      value: this.archiveBucket.bucketName,
      exportName: "ArchiveBucketName",
    });
  }
}
