import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "restaurant-ops-user-pool",
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cognito.UserPoolIdentityProviderGoogle(this, "GoogleProvider", {
      userPool: this.userPool,
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
      scopes: ["email", "profile", "openid"],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: "restaurant-ops-app-client",
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID],
        callbackUrls: ["http://localhost:3000/"],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: "UserPoolId",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: "UserPoolClientId",
    });

    new cognito.CfnUserPoolGroup(this, "OwnersGroup", {
      groupName: "Owners",
      userPoolId: this.userPool.userPoolId,
    });

    new cognito.CfnUserPoolGroup(this, "ManagersGroup", {
      groupName: "Managers",
      userPoolId: this.userPool.userPoolId,
    });
    new cognito.CfnUserPoolGroup(this, "InvestorsGroup", {
      groupName: "Investors",
      userPoolId: this.userPool.userPoolId,
    });
  }
}
