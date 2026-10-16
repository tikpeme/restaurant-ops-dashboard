import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

// Renamed from AlertStackProps → AlertsStackProps for consistency with AlertsStack
interface AlertsStackProps extends cdk.StackProps {
  ownerEmail: string;
}

export class AlertsStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: AlertsStackProps) {
    super(scope, id, props);

    const { ownerEmail } = props;

    // Single topic for all alert types — owner subscribes once and receives all alerts
    this.alertTopic = new sns.Topic(this, "AlertTopic");

    // Rule fires when Lambda publishes a LowRevenueAlert after evaluating a submission
    // Listening on the default event bus — if a custom bus is added later,
    // pass eventBus prop here or this rule will silently never fire
    const rule = new events.Rule(this, "AlertRule", {
      eventPattern: {
        source: ["restaurant.ops"],
        detailType: ["LowRevenueAlert"],
      },
    });

    // Input transformer formats the raw EventBridge JSON into a readable email
    // Without this the owner receives the full event envelope which is unreadable
    rule.addTarget(
      new targets.SnsTopic(this.alertTopic, {
        message: events.RuleTargetInput.fromText(
          `⚠️ Low Revenue Alert | ` +
            `Location: ${events.EventField.fromPath("$.detail.locationId")} | ` +
            `Date: ${events.EventField.fromPath("$.detail.reportDate")} | ` +
            `Revenue: $${events.EventField.fromPath("$.detail.revenue")} | ` +
            `Target: $${events.EventField.fromPath("$.detail.revenueTarget")} | ` +
            `Shortfall: $${events.EventField.fromPath("$.detail.shortfall")}`,
        ),
      }),
    );

    // Owner receives email — must confirm subscription after first deploy
    this.alertTopic.addSubscription(
      new subscriptions.EmailSubscription(ownerEmail),
    );

    // exportName omitted intentionally — cross-stack exports lock the producing
    // stack and collide in multi-stage deployments. Use alertTopic prop instead.
    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
    });
  }
}
