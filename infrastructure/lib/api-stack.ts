import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { AuthStack } from "./auth-stack";
import { DatabaseStack } from "./database-stack";
import { ArchiveStack } from "./archive-stack";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";

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

    const apiLambda = new lambda.Function(this, "ApiLambda", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("../backend"),
      environment: {
        TABLE_NAME: databaseStack.reportsTable.tableName,
        ARCHIVE_BUCKET_NAME: archiveStack.archiveBucket.bucketName,
      },
    });

    databaseStack.reportsTable.grantReadWriteData(apiLambda);
    archiveStack.archiveBucket.grantWrite(apiLambda);

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
    });
    d;
    const reportsResource = this.api.root.addResource("reports");
    reportsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(apiLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      },
    );
    reportsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(apiLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      },
    );

    const locationResource = reportsResource.addResource("{locationId}");
    locationResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(apiLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      },
    );
    const reportDateResource = locationResource.addResource("{reportDate}");
    reportDateResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(apiLambda),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      },
    );
  }
}
