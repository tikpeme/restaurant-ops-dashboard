import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

interface AlertStackProps extends cdk.StackProps {
  ownerEmail: string;
}

export class AlertsStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: AlertStackProps) {
    super(scope, id, props);

    const { ownerEmail } = props;

    // Single topic for all alert types — owner subscribes once and receives all alerts
    this.alertTopic = new sns.Topic(this, "AlertTopic");

    // Triggered when Lambda publishes a LowRevenueAlert event after evaluating a submission
    const rule = new events.Rule(this, "AlertRule", {
      eventPattern: {
        source: ["restaurant.ops"],
        detailType: ["LowRevenueAlert"],
      },
    });

    rule.addTarget(new targets.SnsTopic(this.alertTopic));

    // Owner receives email — must confirm subscription after first deploy
    this.alertTopic.addSubscription(
      new subscriptions.EmailSubscription(ownerEmail),
    );

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
      exportName: "AlertTopicArn",
    });
  }
}
