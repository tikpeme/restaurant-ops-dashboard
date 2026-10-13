import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const locationId = event.pathParameters?.locationId;
  const reportDate = event.pathParameters?.reportDate;

  if (method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const reportId = randomUUID();
      const submittedAt = new Date().toISOString();
      const editableUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
      const avgSpendPerCover = body.revenue / body.coversServed;

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            locationId: body.locationId,
            reportDate: body.reportDate,
            reportId,
            submittedAt,
            editableUntil,
            isArchived: false,
            avgSpendPerCover,
            revenue: body.revenue,
            revenueTarget: body.revenueTarget,
            coversServed: body.coversServed,
            voids: body.voids,
            comps: body.comps,
            incidentNotes: body.incidentNotes,
          },
        }),
      );
      // Fire alert if revenue is below target
      if (body.revenue < body.revenueTarget) {
        await eventBridgeClient.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: "restaurant.ops",
                DetailType: "LowRevenueAlert",
                Detail: JSON.stringify({
                  locationId: body.locationId,
                  reportDate: body.reportDate,
                  revenue: body.revenue,
                  revenueTarget: body.revenueTarget,
                  shortfall: body.revenueTarget - body.revenue,
                }),
                EventBusName: EVENT_BUS_NAME,
              },
            ],
          }),
        );
      }

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: "Report created successfully",
          reportId,
        }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Error creating report",
          error: (error as Error).message,
        }),
      };
    }
  } else if (method === "GET" && !locationId) {
    try {
      const date =
        event.queryStringParameters?.date ||
        new Date().toISOString().split("T")[0];

      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "reportDate-locationId-index",
          KeyConditionExpression: "reportDate = :date",
          ExpressionAttributeValues: { ":date": date },
        }),
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ reports: result.Items }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Error fetching reports",
          error: (error as Error).message,
        }),
      };
    }
  } else if (method === "GET" && locationId && !reportDate) {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "locationId = :locationId",
          ExpressionAttributeValues: { ":locationId": locationId },
        }),
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ reports: result.Items }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Error fetching reports",
          error: (error as Error).message,
        }),
      };
    }
  } else if (method === "PUT" && locationId && reportDate) {
    try {
      const body = JSON.parse(event.body || "{}");

      const existingReport = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { locationId, reportDate },
        }),
      );

      if (!existingReport.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Report not found" }),
        };
      }

      if (existingReport.Item.editableUntil < Math.floor(Date.now() / 1000)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ message: "Edit window has closed" }),
        };
      }

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { locationId, reportDate },
          UpdateExpression:
            "SET revenue = :revenue, revenueTarget = :revenueTarget, coversServed = :coversServed, voids = :voids, comps = :comps, incidentNotes = :incidentNotes, avgSpendPerCover = :avgSpendPerCover",
          ExpressionAttributeValues: {
            ":revenue": body.revenue,
            ":revenueTarget": body.revenueTarget,
            ":coversServed": body.coversServed,
            ":voids": body.voids,
            ":comps": body.comps,
            ":incidentNotes": body.incidentNotes,
            ":avgSpendPerCover": body.revenue / body.coversServed,
          },
        }),
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Report updated successfully" }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Error updating report",
          error: (error as Error).message,
        }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ message: "Method not allowed" }),
  };
};
