#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "../lib/database-stack";
import { AuthStack } from "../lib/auth-stack";
import { ArchiveStack } from "../lib/archive-stack";
import { AlertsStack } from "../lib/alerts-stack";
import { ApiStack } from "../lib/api-stack";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
const ownerEmail = process.env.OWNER_EMAIL || "teteikpeme@gmail.com";

const app = new cdk.App();

const databaseStack = new DatabaseStack(app, "DatabaseStack", { env });
const authStack = new AuthStack(app, "AuthStack", { env });
const archiveStack = new ArchiveStack(app, "ArchiveStack", { env });
const alertsStack = new AlertsStack(app, "AlertsStack", { ownerEmail, env });
const apiStack = new ApiStack(app, "ApiStack", {
  env,
  authStack,
  databaseStack,
  archiveStack,
});
