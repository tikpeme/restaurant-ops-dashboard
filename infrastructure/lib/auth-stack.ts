import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // selfSignUpEnabled: false means only the owner can add users
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "restaurant-ops-user-pool",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      // Which location a manager belongs to. It appears in the ID token as
      // "custom:locationId" and is only writable by an admin (see writeAttributes below)
      customAttributes: {
        locationId: new cognito.StringAttribute({
          mutable: true,
          minLen: 1,
          maxLen: 50,
        }),
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

    // Google credentials come from environment variables, never hardcoded
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleProvider",
      {
        userPool: this.userPool,
        clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
        clientSecretValue: cdk.SecretValue.unsafePlainText(
          process.env.GOOGLE_CLIENT_SECRET || "placeholder",
        ),
        scopes: ["email", "profile", "openid"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      },
    );

    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: "restaurant-ops-app-client",
      authFlows: { userPassword: true },
      // custom:locationId is deliberately NOT in this list. If a user's own token
      // could write it, a manager could reassign themselves to another location.
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
        email: true,
        givenName: true,
        familyName: true,
      }),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:3000/",
          "https://main.d2el5wphqyojln.amplifyapp.com/",
        ],
        logoutUrls: [
          "http://localhost:3000/",
          "https://main.d2el5wphqyojln.amplifyapp.com/",
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });
    this.userPoolClient.node.addDependency(googleProvider);

    // Hosted UI domain, required for the Google redirect
    this.userPool.addDomain("CognitoDomain", {
      cognitoDomain: { domainPrefix: "restaurant-ops-dashboard" },
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: "UserPoolId",
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: "UserPoolClientId",
    });

    // owners: everything. managers: submit and edit their own location.
    // investors: read-only across all locations.
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
