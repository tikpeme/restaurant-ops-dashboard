import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // User Pool — the directory of authorized users
    // selfSignUpEnabled: false means only the owner can add users via the console
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
      // RETAIN ensures user accounts survive stack deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Google as Identity Provider — allows "Sign in with Google"
    // Credentials come from environment variables, never hardcoded
    // UserPoolClient depends on this being created first
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleProvider",
      {
        userPool: this.userPool,
        clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
        clientSecretValue: cdk.SecretValue.unsafePlainText(
          process.env.GOOGLE_CLIENT_SECRET || "placeholder",
        ),
        // Request email, profile and openid from Google
        scopes: ["email", "profile", "openid"],
        // Map Google attributes to Cognito user attributes
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      },
    );

    // App client — how the Next.js frontend connects to the User Pool
    // UserPoolClient must wait for GoogleProvider to be fully deployed
    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: "restaurant-ops-app-client",
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          // Authorization code grant is the most secure OAuth flow
          authorizationCodeGrant: true,
        },
        // All three scopes required — email and profile for user identity,
        // openid to enable the OAuth/OIDC flow
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ["http://localhost:3000/"],
      },
      // Explicitly declare Google as a supported provider
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    // Explicit dependency — prevents UserPoolClient deploying before GoogleProvider
    this.userPoolClient.node.addDependency(googleProvider);

    // Cognito hosted UI domain — required for Google OAuth redirect URI
    this.userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: "restaurant-ops-dashboard",
      },
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: "UserPoolId",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: "UserPoolClientId",
    });

    // Three user groups controlling access levels
    // owners — full dashboard, all locations
    new cognito.CfnUserPoolGroup(this, "OwnersGroup", {
      groupName: "Owners",
      userPoolId: this.userPool.userPoolId,
    });

    // managers — submit reports, view own location only
    new cognito.CfnUserPoolGroup(this, "ManagersGroup", {
      groupName: "Managers",
      userPoolId: this.userPool.userPoolId,
    });

    // investors — read-only full dashboard, no submissions
    new cognito.CfnUserPoolGroup(this, "InvestorsGroup", {
      groupName: "Investors",
      userPoolId: this.userPool.userPoolId,
    });
  }
}
