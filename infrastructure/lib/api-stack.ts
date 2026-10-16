import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { AuthStack } from "./auth-stack";
import { DatabaseStack } from "./database-stack";
import { ArchiveStack } from "./archive-stack";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";

export interface ApiStackProps extends cdk.StackProps {
  authStack: AuthStack;
  databaseStack: DatabaseStack;
  archiveStack: ArchiveStack;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: ApiStackProps) {
    super(scope, id, props);

    const { authStack, databaseStack, archiveStack } = props!;
    // NodejsFunction automatically bundles TypeScript using esbuild
    // This replaces the need to manually compile index.ts before deploying
    const apiLambda = new lambdaNodejs.NodejsFunction(this, "ApiLambda", {
      runtime: lambda.Runtime.NODEJS_24_X,
      // Just the function name — CDK knows the file from entry
      handler: "handler",
      // Absolute path to the TypeScript entry file
      entry: path.join(__dirname, "../../backend/index.ts"),
      // projectRoot must contain the entry file — points to backend/ folder
      projectRoot: path.join(__dirname, "../../backend"),
      // Required when projectRoot is outside the CDK project
      depsLockFilePath: path.join(__dirname, "../../backend/package-lock.json"),
      bundling: {
        // AWS SDK v3 is available in the Lambda runtime — no need to bundle it
        // Marking as external keeps the deployment package smaller
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/lib-dynamodb",
          "@aws-sdk/client-eventbridge",
        ],
      },
      environment: {
        TABLE_NAME: databaseStack.reportsTable.tableName,
        ARCHIVE_BUCKET_NAME: archiveStack.archiveBucket.bucketName,
        // Default EventBridge bus — custom bus recommended in production
        EVENT_BUS_NAME: "default",
      },
    });

    // Least privilege — Lambda only gets what it needs per resource
    databaseStack.reportsTable.grantReadWriteData(apiLambda);
    archiveStack.archiveBucket.grantWrite(apiLambda);

    // EventBridge publish permission — needed to fire low revenue alerts
    apiLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: ["*"],
      }),
    );

    // Cognito authorizer — every route requires a valid JWT token
    // Token is verified against our User Pool before Lambda is invoked
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [authStack.userPool],
      },
    );

    this.api = new apigateway.RestApi(this, "RestaurantOpsApi", {
      restApiName: "Restaurant Operations API",
      description: "This API serves the restaurant operations dashboard.",
      deployOptions: {
        stageName: "v1",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
        ],
      },
    });

    // Route definitions — all protected by Cognito authorizer
    // Access control (which group can call which route) is enforced in Lambda
    const reportsResource = this.api.root.addResource("reports");

    // POST /reports — manager submits end-of-night report
    reportsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(apiLambda),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    // GET /reports — owner dashboard, queries all locations by date via GSI
    reportsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(apiLambda),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    const locationResource = reportsResource.addResource("{locationId}");

    // GET /reports/{locationId} — manager view, queries by location partition key
    locationResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(apiLambda),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    const reportDateResource = locationResource.addResource("{reportDate}");

    // PUT /reports/{locationId}/{reportDate} — edit report within 24hr window
    // editableUntil TTL enforced at data layer in Lambda before UpdateCommand
    reportDateResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(apiLambda),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.url,
      exportName: "RestaurantOpsApiUrl",
    });
  }
}
