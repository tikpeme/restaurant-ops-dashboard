import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class DatabaseStack extends cdk.Stack {
  public readonly reportsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.reportsTable = new dynamodb.Table(this, "ReportsTable", {
      tableName: "restaurant-reports",
      partitionKey: {
        name: "locationId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "reportDate",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "editableUntil",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for owner dashboard - query all locations by date
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: "reportDate-locationId-index",
      partitionKey: {
        name: "reportDate",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "locationId",
        type: dynamodb.AttributeType.STRING,
      },
    });

    new cdk.CfnOutput(this, "ReportsTableName", {
      value: this.reportsTable.tableName,
      exportName: "ReportsTableName",
    });
  }
}
